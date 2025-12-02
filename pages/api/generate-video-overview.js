import OpenAI from 'openai';
import { searchDocuments } from '../../lib/vectorStore';
import { supabase } from '../../lib/supabase';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Analyze images using GPT-4 Vision and return descriptions
 */
async function analyzeImages(images) {
  if (!images || images.length === 0) return [];

  const descriptions = [];

  for (const image of images) {
    try {
      // Skip if no base64 data
      if (!image.pdf_data) continue;

      console.log(`🖼️ Analyzing image for video: ${image.name}`);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image in detail for an educational video presentation. Focus on: key visual elements, diagrams, charts, labels, and any important information shown. Keep the description concise but informative (2-3 sentences).',
              },
              {
                type: 'image_url',
                image_url: {
                  url: image.pdf_data, // Already in data:image/... format
                  detail: 'low', // Use low detail to save tokens
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      });

      descriptions.push({
        name: image.name,
        description: response.choices[0].message.content,
      });

      console.log(`✅ Analyzed image: ${image.name}`);
    } catch (error) {
      console.error(`Error analyzing image ${image.name}:`, error.message);
    }
  }

  return descriptions;
}

/**
 * Add text overlay to an image using sharp
 */
async function addTextOverlay(imagePath, slide, outputPath) {
  const { heading, bulletPoints } = slide;

  // Get image dimensions
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 1792;
  const height = metadata.height || 1024;

  // Escape special characters for SVG
  const escapeText = (text) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const escapedHeading = escapeText(heading);
  const escapedBullets = bulletPoints.map(b => escapeText(b));

  // Calculate panel dimensions - bottom third of image
  const panelHeight = Math.min(350, height * 0.4);
  const panelY = height - panelHeight;
  const panelPadding = 60;
  const headingY = panelY + 70;
  const bulletStartY = headingY + 55;
  const bulletSpacing = 45;

  // Build bullet points SVG with better formatting
  const bulletsSvg = escapedBullets.slice(0, 4).map((bullet, idx) =>
    `<text x="${panelPadding + 30}" y="${bulletStartY + idx * bulletSpacing}" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="rgba(255,255,255,0.95)" font-weight="400" letter-spacing="0.3">
      <tspan fill="rgba(100,200,255,1)" font-size="20">&#9679;</tspan>  ${bullet}
    </text>`
  ).join('\n');

  const svgOverlay = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Bottom panel gradient -->
        <linearGradient id="panelGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:rgba(0,0,0,0)"/>
          <stop offset="30%" style="stop-color:rgba(0,0,0,0.7)"/>
          <stop offset="100%" style="stop-color:rgba(0,0,0,0.92)"/>
        </linearGradient>
        <!-- Text shadow filter -->
        <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.5)"/>
        </filter>
      </defs>

      <!-- Semi-transparent bottom panel -->
      <rect x="0" y="${panelY - 50}" width="${width}" height="${panelHeight + 50}" fill="url(#panelGradient)"/>

      <!-- Accent line -->
      <rect x="${panelPadding}" y="${panelY + 15}" width="80" height="4" rx="2" fill="rgba(100,200,255,0.9)"/>

      <!-- Heading with shadow -->
      <text x="${panelPadding}" y="${headingY}" font-family="Helvetica, Arial, sans-serif" font-size="38" fill="white" font-weight="600" filter="url(#textShadow)" letter-spacing="0.5">${escapedHeading}</text>

      <!-- Bullet points -->
      ${bulletsSvg}
    </svg>
  `;

  try {
    await sharp(imagePath)
      .composite([{
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      }])
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Error adding text overlay:', error.message);
    // If overlay fails, just copy the original
    fs.copyFileSync(imagePath, outputPath);
    return outputPath;
  }
}

// Increase timeout for video generation
export const config = {
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
  maxDuration: 300, // 5 minutes
};

/**
 * Generate slide images using DALL-E 3
 */
async function generateSlideImage(slideContent, style = 'modern') {
  const stylePrompts = {
    modern: 'Clean, modern, minimalist educational illustration with soft gradients and professional colors.',
    whiteboard: 'Hand-drawn whiteboard style sketch with blue and black ink on white background.',
    watercolor: 'Beautiful watercolor illustration with soft, flowing colors and artistic style.',
    retro: 'Retro vintage infographic style with muted colors and classic typography feel.',
  };

  const prompt = `Create an educational illustration for a presentation slide about: "${slideContent}".
Style: ${stylePrompts[style] || stylePrompts.modern}
The image should be clear, informative, and visually engaging. No text in the image.
Aspect ratio: 16:9 landscape format suitable for video.`;

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1792x1024', // 16:9 ratio
      quality: 'standard',
    });

    return response.data[0].url;
  } catch (error) {
    console.error('Error generating image:', error.message);
    return null;
  }
}

/**
 * Download image from URL and save to temp file
 */
async function downloadImage(url, filepath) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
  return filepath;
}

/**
 * Generate audio for narration using TTS
 */
async function generateNarrationAudio(text, outputPath) {
  const mp3Response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'nova',
    input: text,
    speed: 1.0,
  });

  const buffer = Buffer.from(await mp3Response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tempDir = path.join(os.tmpdir(), `video-${Date.now()}`);

  try {
    const { sessionId = 'default', style = 'modern' } = req.body;

    console.log(`🎬 Generating Video Overview for session ${sessionId}`);

    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    // Fetch images from the database for this session
    let imageDescriptions = [];
    try {
      const { data: images, error: imgError } = await supabase
        .from('uploaded_files')
        .select('name, pdf_data')
        .eq('session_id', sessionId)
        .eq('type', 'image');

      if (!imgError && images && images.length > 0) {
        console.log(`🖼️ Found ${images.length} images for session`);
        imageDescriptions = await analyzeImages(images);
        console.log(`✅ Analyzed ${imageDescriptions.length} images`);
      }
    } catch (err) {
      console.error('Error fetching images:', err.message);
    }

    // Get content from documents using vector search
    const topics = [
      "main topics and themes",
      "key concepts and definitions",
      "important facts and findings",
      "conclusions and implications",
    ];

    let allContext = [];
    for (const topic of topics) {
      const results = await searchDocuments(topic, 5, sessionId);
      allContext = [...allContext, ...results];
    }

    // Remove duplicates
    const uniqueContent = Array.from(
      new Map(allContext.map(item => [item.content, item])).values()
    );

    if (uniqueContent.length === 0 && imageDescriptions.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(400).json({
        error: 'No content found. Please upload documents or images first.'
      });
    }

    console.log(`📚 Found ${uniqueContent.length} content chunks`);

    // Get unique source files
    const sources = [...new Set(uniqueContent.map(doc => doc.metadata.source))];

    // Create context string
    const contextStr = uniqueContent.length > 0
      ? uniqueContent
          .slice(0, 10)
          .map(doc => doc.content)
          .join('\n\n')
      : '';

    // Create image descriptions context
    const imageContextStr = imageDescriptions.length > 0
      ? '\n\nIMAGES/DIAGRAMS:\n' + imageDescriptions
          .map(img => `Image "${img.name}": ${img.description}`)
          .join('\n\n')
      : '';

    // Build content description
    const contentParts = [];
    if (sources.length > 0) contentParts.push(`${sources.length} document(s): ${sources.join(', ')}`);
    if (imageDescriptions.length > 0) contentParts.push(`${imageDescriptions.length} image(s): ${imageDescriptions.map(i => i.name).join(', ')}`);
    const contentDescription = contentParts.join(' and ');

    // Step 1: Generate slide script with GPT-4
    console.log('📝 Generating slide script...');

    const scriptPrompt = `You are creating a Video Overview presentation. The user has uploaded ${contentDescription}. Based on the following content, create a structured presentation with 4-6 slides.
${contextStr ? `\nContent from documents:\n${contextStr}` : ''}
${imageContextStr}

Generate a JSON response with this exact structure:
{
  "title": "Presentation title",
  "slides": [
    {
      "heading": "Slide heading",
      "bulletPoints": ["Point 1", "Point 2", "Point 3"],
      "narration": "Full narration text for this slide (2-3 sentences, conversational)",
      "imagePrompt": "Brief description of what illustration would help explain this concept"
    }
  ]
}

Guidelines:
- First slide should be an introduction/overview
- Last slide should be key takeaways
- Middle slides cover main concepts
- If images/diagrams are provided, dedicate slides to explain the key visual information
- Narration should be conversational and engaging
- Each slide's narration should be about 15-20 seconds when spoken
- Keep bullet points concise (max 8 words each)`;

    const scriptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating educational video presentations. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: scriptPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    let slideScript;
    try {
      slideScript = JSON.parse(scriptCompletion.choices[0].message.content);
    } catch (e) {
      console.error('Failed to parse slide script:', e);
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Failed to generate slide script' });
    }

    console.log(`✅ Generated ${slideScript.slides.length} slides`);

    // Step 2: Generate images for each slide
    console.log('🎨 Generating slide images with DALL-E 3...');

    const slideImages = [];
    for (let i = 0; i < slideScript.slides.length; i++) {
      const slide = slideScript.slides[i];
      console.log(`  Generating image ${i + 1}/${slideScript.slides.length}...`);

      const imageUrl = await generateSlideImage(slide.imagePrompt, style);

      if (imageUrl) {
        const imagePath = path.join(tempDir, `slide-${i}.png`);
        await downloadImage(imageUrl, imagePath);

        // Add text overlay with heading and bullet points
        const overlayPath = path.join(tempDir, `slide-${i}-overlay.png`);
        await addTextOverlay(imagePath, slide, overlayPath);

        slideImages.push({
          path: overlayPath,
          duration: 8, // seconds per slide
        });
      }
    }

    if (slideImages.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(500).json({ error: 'Failed to generate slide images' });
    }

    // Step 3: Generate audio narration
    console.log('🎤 Generating audio narration...');

    const fullNarration = slideScript.slides
      .map(slide => slide.narration)
      .join(' ... ');

    const audioPath = path.join(tempDir, 'narration.mp3');
    await generateNarrationAudio(fullNarration, audioPath);

    // Step 4: Create video with videoshow
    console.log('🎬 Creating video with videoshow...');

    const videoshow = (await import('videoshow')).default;
    const ffmpegPath = (await import('@ffmpeg-installer/ffmpeg')).path;
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    ffmpeg.setFfmpegPath(ffmpegPath);

    const videoPath = path.join(tempDir, 'output.mp4');

    // Calculate duration per slide based on audio length
    const audioDuration = await getAudioDuration(audioPath);
    const durationPerSlide = Math.max(5, Math.ceil(audioDuration / slideImages.length));

    const videoOptions = {
      fps: 24,
      loop: durationPerSlide,
      transition: true,
      transitionDuration: 0.5,
      videoBitrate: 1024,
      videoCodec: 'libx264',
      size: '1280x720',
      audioBitrate: '128k',
      audioChannels: 2,
      format: 'mp4',
      pixelFormat: 'yuv420p',
    };

    await new Promise((resolve, reject) => {
      videoshow(slideImages.map(s => s.path), videoOptions)
        .audio(audioPath)
        .save(videoPath)
        .on('start', (command) => {
          console.log('ffmpeg process started:', command);
        })
        .on('error', (err, stdout, stderr) => {
          console.error('Error:', err);
          console.error('ffmpeg stderr:', stderr);
          reject(err);
        })
        .on('end', (output) => {
          console.log('Video created:', output);
          resolve(output);
        });
    });

    // Read video and convert to base64
    const videoBuffer = fs.readFileSync(videoPath);
    const base64Video = videoBuffer.toString('base64');
    const videoDataUrl = `data:video/mp4;base64,${base64Video}`;

    // Cleanup temp files
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`✅ Video Overview generated (${videoBuffer.length} bytes)`);

    // Combine document sources and image names
    const allFiles = [...sources, ...imageDescriptions.map(i => i.name)];

    return res.status(200).json({
      success: true,
      videoUrl: videoDataUrl,
      script: slideScript,
      slideCount: slideScript.slides.length,
      fileCount: allFiles.length,
      files: allFiles,
      imageCount: imageDescriptions.length,
    });

  } catch (error) {
    console.error('Error generating video overview:', error);
    // Cleanup on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return res.status(500).json({
      error: 'Failed to generate video overview',
      details: error.message
    });
  }
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(audioPath) {
  return new Promise(async (resolve) => {
    try {
      const ffprobePath = (await import('@ffprobe-installer/ffprobe')).path;
      const { exec } = require('child_process');
      exec(`"${ffprobePath}" -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`, (err, stdout) => {
        if (err) {
          console.error('Error getting audio duration:', err);
          resolve(30); // Default 30 seconds
        } else {
          resolve(parseFloat(stdout.trim()) || 30);
        }
      });
    } catch (e) {
      console.error('ffprobe not available, using default duration');
      resolve(30);
    }
  });
}
