import formidable from "formidable";
import fs from "fs";
import path from "path";
import { addDocumentsToStore } from "../../lib/vectorStore";
import { performOCR } from "../../lib/ocrProcessor";
import OpenAI from "openai";
import { getAuth } from "@clerk/nextjs/server";
import { supabase } from "../../lib/supabase";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: false,
    // Increase timeout for OCR processing
    externalResolver: true,
  },
};

async function processTextContent(text, fileName, fileType = "text", pageNumber = null, boundingBoxes = null) {
  const chunks = [];

  // Advanced text cleaning for better PDF extraction
  let cleanedText = text
    // Fix words stuck together (academic papers often have this issue)
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase separation
    .replace(/([a-z])([A-Z][a-z])/g, '$1 $2')  // sentenceCase fix
    .replace(/([a-z]{3,})([A-Z])/g, '$1 $2')  // word followed by capital
    .replace(/([)])([A-Z])/g, '$1 $2')  // closing bracket then capital
    .replace(/([.!?,;:])([A-Za-z])/g, '$1 $2')  // punctuation then letter
    .replace(/([a-z])(\()/g, '$1 $2')  // letter then opening bracket

    // Fix academic citation formats
    .replace(/\)([A-Z])/g, ') $1')  // closing paren then capital
    .replace(/(\d{4})\)([A-Za-z])/g, '$1) $2')  // year citation then text
    .replace(/et\s*al\.\s*,/g, 'et al.,')  // fix "et al." spacing
    .replace(/\(\s+/g, '(')  // remove space after opening paren
    .replace(/\s+\)/g, ')')  // remove space before closing paren

    // Fix common word combinations that get stuck
    .replace(/([a-z])(by|in|of|to|and|or|for|with|from|into|over|under)([A-Z])/g, '$1 $2 $3')

    // Handle hyphenated words across lines
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')  // Join hyphenated words

    // Fix spacing around numbers
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')  // letter then number
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')  // number then letter
    .replace(/(\d),(\d)/g, '$1, $2')  // add space after comma in numbers

    // Normalize whitespace
    .replace(/\s+/g, ' ')  // Multiple spaces to single
    .replace(/\n\s*\n\s*\n+/g, '\n\n')  // Multiple line breaks to double
    .replace(/[\r\n]+/g, '\n')  // Normalize line endings

    // Final cleanup
    .replace(/\s+([.!?,;:])/g, '$1')  // Remove space before punctuation
    .replace(/\s+$/gm, '')  // Remove trailing spaces
    .trim();

  if (!cleanedText || cleanedText.length < 10) {
    return chunks;
  }

  // Reliable chunking: small chunks with high overlap for precise citations
  const chunkSize = 200;  // Small chunks = each chunk is one focused point
  const overlap = 100;    // 50% overlap ensures nothing is missed

  // Split on double newlines (paragraphs) first
  const paragraphs = cleanedText.split(/\n\n+/);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, save current chunk and start new one
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          source: fileName,
          type: fileType,
          ...(pageNumber && { page: pageNumber }),
        },
      });
      // Start new chunk with overlap from previous chunk
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-30).join(' '); // Last ~30 words for context
      currentChunk = overlapWords + ' ' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }

    // If current chunk is already large, split it
    if (currentChunk.length >= chunkSize) {
      chunks.push({
        content: currentChunk.slice(0, chunkSize).trim(),
        metadata: {
          source: fileName,
          type: fileType,
          ...(pageNumber && { page: pageNumber }),
        },
      });
      currentChunk = currentChunk.slice(chunkSize - overlap);
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 10) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: {
        source: fileName,
        type: fileType,
        ...(pageNumber && { page: pageNumber }),
      },
    });
  }

  return chunks;
}

async function processPDF(filePath, fileName) {
  // Use pdf2json for reliable text extraction
  console.log(`Processing PDF: ${fileName}`);

  // Use pdf2json for text extraction (Vision processing disabled - requires GraphicsMagick)
  const methods = [];

  // Method 1: Try pdf2json
  methods.push(async () => {
    try {
      const PDFParser = (await import("pdf2json")).default;
      const pdfParser = new PDFParser();

      return new Promise((resolve, reject) => {
        pdfParser.on("pdfParser_dataError", errData => reject(errData));
        pdfParser.on("pdfParser_dataReady", async (pdfData) => {
          const chunks = [];

          // Extract text from all pages
          if (pdfData && pdfData.Pages) {
            const totalPages = pdfData.Pages.length;
            console.log(`Processing ${totalPages} pages from PDF...`);

            for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
              const page = pdfData.Pages[pageIndex];
              let pageText = "";
              let lastX = 0;
              let lastY = 0;
              const pageBoundingBoxes = []; // Store bounding boxes for this page

              if (page.Texts) {
                for (let textIndex = 0; textIndex < page.Texts.length; textIndex++) {
                  const text = page.Texts[textIndex];
                  const x = text.x || 0;
                  const y = text.y || 0;
                  const w = text.w || 1;

                  if (text.R) {
                    for (const r of text.R) {
                      if (r.T) {
                        let decodedText = "";
                        try {
                          decodedText = decodeURIComponent(r.T);
                        } catch (e) {
                          decodedText = r.T;
                        }

                        // Store bounding box for this text element
                        const fontSize = r.TS ? r.TS[1] || 12 : 12;
                        pageBoundingBoxes.push({
                          text: decodedText,
                          x: x,
                          y: y,
                          w: w,
                          h: fontSize / 12, // Approximate height
                          charStart: pageText.length,
                          charEnd: pageText.length + decodedText.length
                        });

                        // Add spacing based on position
                        if (pageText.length > 0) {
                          const horizontalGap = Math.abs(x - lastX);
                          const verticalGap = Math.abs(y - lastY);

                          // New line if significant vertical change
                          if (verticalGap > 0.3) {
                            pageText += "\n";
                          }
                          // Always add space between text elements to prevent run-together words
                          else {
                            // Add space between all text elements unless already present
                            if (!pageText.endsWith(" ") && !pageText.endsWith("\n")) {
                              pageText += " ";
                            }
                          }
                        }

                        pageText += decodedText;
                        lastX = x + (text.w || 0);
                        lastY = y;
                      }
                    }
                  }
                }
              }

              // Process each page immediately to avoid memory issues
              if (pageText.trim().length > 50) {
                const pageChunks = await processTextContent(
                  pageText,
                  fileName,
                  "pdf",
                  pageIndex + 1,
                  pageBoundingBoxes // Pass bounding boxes
                );
                chunks.push(...pageChunks);
              }

              // Log progress for large books
              if (totalPages > 100 && (pageIndex + 1) % 50 === 0) {
                console.log(`Processed ${pageIndex + 1}/${totalPages} pages...`);
              }
            }
          }

          // Check if we extracted meaningful content
          if (chunks.length > 0) {
            console.log(`Successfully extracted ${chunks.length} chunks from ${pdfData.Pages.length} pages using pdf2json`);
            resolve(chunks);
          } else {
            reject(new Error("No readable text extracted"));
          }
        });

        pdfParser.loadPDF(filePath);
      });
    } catch (error) {
      console.log("pdf2json method failed:", error.message);
      throw error;
    }
  });

  // Method 2: Try pdfjs-dist (good for standard PDFs)
  // Enhanced to handle large books page by page
  methods.push(async () => {
    try {
      const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = false;

      const dataBuffer = fs.readFileSync(filePath);
      const data = new Uint8Array(dataBuffer);

      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;

      const chunks = [];
      const numPages = pdf.numPages;
      console.log(`Processing ${numPages} pages from PDF using pdfjs-dist...`);

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Better spacing logic: add space between items based on positioning
        let pageText = "";
        let lastX = 0;
        let lastY = 0;

        textContent.items.forEach((item, index) => {
          const str = item.str.trim();
          if (!str) return;

          // Get position from transform matrix
          const x = item.transform[4];
          const y = item.transform[5];

          if (index > 0) {
            // Add space if there's significant horizontal distance
            // or if we're on a new line
            const horizontalGap = Math.abs(x - lastX);
            const verticalGap = Math.abs(y - lastY);

            if (verticalGap > 2) {
              // New line
              pageText += "\n";
            } else if (horizontalGap > item.width * 0.3) {
              // Add space if gap is significant
              pageText += " ";
            }
          }

          pageText += str;
          lastX = x + (item.width || 0);
          lastY = y;
        });

        // Process each page immediately to avoid memory issues
        if (pageText.trim().length > 50) {
          const pageChunks = await processTextContent(
            pageText,
            fileName,
            "pdf",
            i
          );
          chunks.push(...pageChunks);
        }

        // Log progress for large books
        if (numPages > 100 && i % 50 === 0) {
          console.log(`Processed ${i}/${numPages} pages...`);
        }
      }

      // Check if we extracted meaningful content
      if (chunks.length > 0) {
        console.log(`Successfully extracted ${chunks.length} chunks from ${numPages} pages using pdfjs-dist`);
        return chunks;
      }
      throw new Error("No readable text extracted");
    } catch (error) {
      console.log("pdfjs-dist method failed:", error.message);
      throw error;
    }
  });

  // Try standard extraction methods first
  let extractedChunks = [];
  let lastError = null;

  for (const method of methods) {
    try {
      const result = await method();

      // Check if result is already chunks (from new page-by-page methods)
      if (Array.isArray(result) && result.length > 0) {
        console.log("Standard extraction successful (page-by-page processing)");
        return result;
      }

      // Old method returned full text string
      if (result && typeof result === 'string' && result.trim().length > 50) {
        // Check if text is actually readable
        const readableWords = result.match(/[a-zA-Z]{3,}/g) || [];
        if (readableWords.length > 10) {
          console.log("Standard extraction successful");
          return processTextContent(result, fileName, "pdf");
        }
      }
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  // All methods failed
  throw new Error(
    `Could not extract text from PDF. The file might be:\n` +
    `- Corrupted or damaged\n` +
    `- Password protected\n` +
    `- Contains no readable text`
  );
}

async function processTextFile(filePath, fileName) {
  const text = fs.readFileSync(filePath, "utf-8");
  return processTextContent(text, fileName, "text");
}

async function processImage(filePath, fileName) {
  try {
    console.log(`Starting GPT-4 Vision analysis for image: ${fileName}`);

    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');
    const fileExt = path.extname(fileName).toLowerCase();

    // Determine MIME type
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    const mimeType = mimeTypes[fileExt] || 'image/jpeg';

    // Use GPT-4 Vision to analyze the image
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image in detail. Describe:\n1. What is shown in the image (diagrams, charts, photos, documents, etc.)\n2. All visible text content (transcribe it accurately)\n3. Key visual elements, labels, and annotations\n4. Any data, numbers, or measurements shown\n5. The context and purpose of the image\n\nProvide a comprehensive description that captures all information in the image."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
    });

    const visionDescription = visionResponse.choices[0].message.content;

    if (!visionDescription || visionDescription.trim().length < 20) {
      throw new Error("GPT-4 Vision failed to analyze the image");
    }

    console.log(`GPT-4 Vision analysis completed. Generated ${visionDescription.length} characters of description`);

    // Optionally also run OCR for additional text extraction (as fallback/supplement)
    let ocrText = "";
    try {
      console.log(`Running OCR as supplement...`);
      const ocrResult = await performOCR(imageBuffer, {
        onProgress: (progress) => {
          console.log(`OCR progress: ${progress}%`);
        }
      });
      if (ocrResult.text && ocrResult.text.trim().length > 10) {
        ocrText = `\n\n--- OCR Text Extraction ---\n${ocrResult.text}`;
        console.log(`OCR completed. Extracted ${ocrResult.text.length} additional characters`);
      }
    } catch (ocrError) {
      console.log(`OCR supplement failed (non-critical): ${ocrError.message}`);
      // Continue without OCR - Vision description is enough
    }

    // Combine vision analysis with OCR text
    const fullDescription = `--- Image Analysis by GPT-4 Vision ---\n${visionDescription}${ocrText}`;

    return processTextContent(fullDescription, fileName, "image-vision");
  } catch (error) {
    console.error("Image processing failed:", error);
    throw new Error(`Could not process image: ${error.message}`);
  }
}

export default async function handler(req, res) {
  // Set a longer timeout for large book processing
  res.socket.setTimeout(15 * 60 * 1000); // 15 minutes for large books

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get authenticated user ID from Clerk
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized - Please sign in" });
  }

  try {
    const uploadDir = path.join(process.cwd(), "data", "uploads");

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB per file
      maxTotalFileSize: 500 * 1024 * 1024, // 500MB total for up to 50 files
      maxFiles: 50, // Allow up to 50 files
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.file?.[0] || files.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Get sessionId from form fields
    const sessionId = fields.sessionId?.[0] || fields.sessionId || 'default';

    const filePath = file.filepath;
    const fileName = file.originalFilename || file.newFilename;
    const fileExt = path.extname(fileName).toLowerCase();

    console.log(`Processing file: ${fileName} (${fileExt})`);

    let documents = [];
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"];

    if (fileExt === ".pdf") {
      documents = await processPDF(filePath, fileName);
    } else if (fileExt === ".txt" || fileExt === ".md" || fileExt === ".csv" || fileExt === ".json") {
      documents = await processTextFile(filePath, fileName);
    } else if (imageExtensions.includes(fileExt)) {
      documents = await processImage(filePath, fileName);
    } else {
      // Cleanup uploaded file
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Unsupported file type. Please upload TXT, MD, CSV, JSON, PDF, or image files (JPG, PNG, GIF, BMP, WEBP, SVG)." });
    }

    console.log(`Extracted ${documents.length} chunks from ${fileName} for user ${userId}, session ${sessionId}`);

    // Add to vector store with BOTH session ID and user ID for double isolation
    const result = await addDocumentsToStore(documents, sessionId, userId);

    // Read file data as base64 for later viewing - BEFORE deleting file
    let fileBase64 = null;
    const imageExtensionsForSave = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
    if (fileExt === '.pdf') {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        fileBase64 = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
      } catch (e) {
        console.log('Could not read PDF for base64 encoding:', e);
      }
    } else if (imageExtensionsForSave.includes(fileExt)) {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp' };
        fileBase64 = `data:${mimeTypes[fileExt] || 'image/jpeg'};base64,${fileBuffer.toString('base64')}`;
        console.log(`Saved image as base64 for chat: ${fileName}`);
      } catch (e) {
        console.log('Could not read image for base64 encoding:', e);
      }
    }

    // Cleanup uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.log("Could not delete temp file:", e);
    }

    // Save file metadata to Supabase
    const fileType = documents[0]?.metadata?.type || fileExt;
    const pageCount = documents[0]?.metadata?.page ?
      Math.max(...documents.map(d => d.metadata?.page || 1)) : null;

    try {
      await supabase.from('uploaded_files').insert({
        session_id: sessionId,
        user_id: userId,
        name: fileName,
        type: fileType,
        size: file.size,
        chunks: result.count,
        pages: pageCount,
        pdf_data: fileBase64,
      });
      console.log(`Saved file metadata to Supabase: ${fileName}`);
    } catch (dbError) {
      console.error('Error saving file to Supabase:', dbError);
    }

    res.status(200).json({
      success: true,
      message: `Successfully processed ${fileName}`,
      chunksAdded: result.count,
      method: (documents[0]?.metadata?.type === "image-vision" || documents[0]?.metadata?.type === "pdf-vision") ? "GPT-4 Vision" : "standard"
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to process document" });
  }
}