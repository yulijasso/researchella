import formidable from "formidable";
import fs from "fs";
import path from "path";
import { addDocumentsToStore } from "../../lib/vectorStore";
import { performOCR } from "../../lib/ocrProcessor";
import OpenAI from "openai";
import { getAuth } from "@clerk/nextjs/server";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseServer";
import { exec } from "child_process";
import { promisify } from "util";
import { cleanPDFText } from "../../lib/intelligentTextCleaner";

const execPromise = promisify(exec);

// Get Python path at runtime to avoid Turbopack static analysis of venv symlinks
function getPythonPath() {
  // Construct path at runtime using array join to prevent static analysis
  const parts = [process.cwd(), 'venv', 'bin', 'python3'];
  return parts.join(path.sep);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: false,
    // Increase timeout for large file processing
    externalResolver: true,
    // Disable response size limit for large files
    responseLimit: false,
  },
};

// Fast chunking without GPT cleaning - uses only regex-based cleaning
function fastChunkText(text, fileName, fileType = "pdf", pageNumber = null) {
  const chunks = [];

  // Apply universal text cleaning (regex only, no GPT)
  let cleanedText = cleanTextUniversal(text);

  if (!cleanedText || cleanedText.length < 10) {
    return chunks;
  }

  // Simple sentence-aware chunking
  const chunkSize = 500;  // Slightly larger chunks for speed
  const overlap = 100;

  // Split on sentence boundaries
  const sentences = cleanedText.split(/(?<=[.!?])\s+/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          source: fileName,
          type: fileType,
          ...(pageNumber && { page: pageNumber }),
        },
      });
      // Keep last part for overlap
      const words = currentChunk.split(' ');
      currentChunk = words.slice(-20).join(' ') + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
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

// Universal text cleaning function - fixes all spacing and formatting issues
function cleanTextUniversal(text) {
  if (!text) return '';

  // First apply intelligent cleaning for PDF-specific issues
  text = cleanPDFText(text);

  let cleaned = text
    // Remove line breaks and tabs initially
    .replace(/[\r\n\t]+/g, ' ')
    // Replace non-breaking spaces with regular spaces
    .replace(/\u00A0/g, ' ')

    // Fix excessive character spacing (e.g., "D e v e l o p m e n t" -> "Development")
    .replace(/\b([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])(\s+[a-zA-Z])*\b/g, (match) => {
      return match.replace(/\s+/g, '');
    })

    // Fix spaces within words (e.g., "Envir onment" -> "Environment")
    .replace(/\b([A-Z][a-z]{1,4})\s+([a-z]{2,})\b/g, '$1$2')
    // Fix single capital + space + lowercase (e.g., "Y ou" -> "You")
    .replace(/\b([A-Z])\s+([a-z]{2,})\b/g, '$1$2')
    // Fix word fragment + space + continuation (e.g., "applicatio n" -> "application")
    .replace(/([a-z]{5,})\s+([a-z]{1,3})\b/g, '$1$2')
    // Fix lowercase + space + lowercase within words (e.g., "natu re" -> "nature")
    .replace(/([a-z]{2,})\s+([a-z]{2})\b/g, (match, p1, p2) => {
      if (p2.length <= 2 && (p2.match(/^(re|ly|ed|er|al|le|ty|ry|ng|nt|nd|st)$/))) {
        return p1 + p2;
      }
      return match;
    })

    // Fix words stuck together (academic papers)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([)])([A-Z])/g, '$1 $2')

    // Fix common stuck words (e.g., "ideaof" -> "idea of", "depthfora" -> "depth for a")
    .replace(/([a-z]{3,})(of|in|on|at|to|is|or|and|for|the|you|your|with|from|that|this|will|can|are|was|but|not|has|have|been)([a-z]{2,})/gi, '$1 $2 $3')
    .replace(/([a-z]{3,})(of|in|on|at|to|is|or|and|for|the|you|your|with|from|that|this|will|can|are|was|but|not|has|have|been)\b/gi, '$1 $2')
    .replace(/\b(of|in|on|at|to|is|or|and|for|the|you|your|with|from|that|this|will|can|are|was|but|not|has|have|been)([a-z]{3,})/gi, '$1 $2')

    // Fix academic citation formats
    .replace(/(\d{4})\)([A-Za-z])/g, '$1) $2')
    .replace(/et\s*al\.\s*,/g, 'et al.,')

    // Normalize multiple spaces to single space
    .replace(/\s+/g, ' ')

    // Fix punctuation spacing
    .replace(/\s+([.,;:!?)\]}])/g, '$1')  // Remove spaces before punctuation
    .replace(/([({\[])\s+/g, '$1')  // Remove spaces after opening punctuation
    .replace(/([.,;:!?])([A-Za-z])/g, '$1 $2')  // Ensure space after punctuation
    .replace(/([)\]}])([A-Za-z])/g, '$1 $2')  // Space after closing punctuation

    // Fix multiple consecutive punctuation
    .replace(/\.{2,}/g, '.')
    .replace(/\?{2,}/g, '?')
    .replace(/!{2,}/g, '!')

    // Fix spacing around hyphens
    .replace(/\s+-\s+/g, '-')

    // Fix spacing around quotes
    .replace(/\s+"/g, ' "')
    .replace(/"\s+/g, '" ')
    .replace(/\s+'/g, " '")
    .replace(/'\s+/g, "' ")

    // Fix common contractions
    .replace(/won\s+'\s*t\b/gi, "won't")
    .replace(/can\s+'\s*t\b/gi, "can't")
    .replace(/don\s+'\s*t\b/gi, "don't")
    .replace(/doesn\s+'\s*t\b/gi, "doesn't")
    .replace(/isn\s+'\s*t\b/gi, "isn't")
    .replace(/aren\s+'\s*t\b/gi, "aren't")
    .replace(/wasn\s+'\s*t\b/gi, "wasn't")
    .replace(/weren\s+'\s*t\b/gi, "weren't")
    .replace(/hasn\s+'\s*t\b/gi, "hasn't")
    .replace(/haven\s+'\s*t\b/gi, "haven't")
    .replace(/hadn\s+'\s*t\b/gi, "hadn't")
    .replace(/wouldn\s+'\s*t\b/gi, "wouldn't")
    .replace(/couldn\s+'\s*t\b/gi, "couldn't")
    .replace(/shouldn\s+'\s*t\b/gi, "shouldn't")

    // Final cleanup
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

async function processTextContent(text, fileName, fileType = "text", pageNumber = null, boundingBoxes = null) {
  const chunks = [];

  // Apply universal text cleaning first
  let cleanedText = cleanTextUniversal(text);

  if (!cleanedText || cleanedText.length < 10) {
    return chunks;
  }

  // Skip AI cleaning for pdfplumber (fast uploads)
  // pdfplumber extracts text cleanly for most PDFs
  const skipAICleaning = fileType === "pdf-plumber";

  // Only run GPT cleaning if not from pdfplumber
  if (!skipAICleaning) {
    console.log(`🔧 Applying two-pass GPT-4o cleaning to ${fileName}...`);

    // ALWAYS use GPT-4o to clean text, handling long pages by chunking first
    // Split into GPT-friendly chunks (500-3500 chars) for cleaning
    const gptChunks = [];
    const GPT_CHUNK_SIZE = 3000;
    const GPT_OVERLAP = 100;

    if (cleanedText.length <= GPT_CHUNK_SIZE) {
      // Short enough to process in one go
      gptChunks.push(cleanedText);
    } else {
      // Split into overlapping chunks for GPT processing
      let pos = 0;
      while (pos < cleanedText.length) {
        const chunk = cleanedText.substring(pos, pos + GPT_CHUNK_SIZE);
        gptChunks.push(chunk);
        pos += GPT_CHUNK_SIZE - GPT_OVERLAP;
      }
    }

    // Clean each GPT chunk with TWO-PASS approach for maximum quality
    const cleanedGptChunks = [];
    for (let i = 0; i < gptChunks.length; i++) {
    const gptChunk = gptChunks[i];

    if (gptChunk.length >= 50) {
      try {
        // PASS 1: Use GPT-4o for text structure and spacing analysis
        console.log(`🧠 Pass 1/2: Using GPT-4o for spacing analysis on chunk ${i+1}/${gptChunks.length} from ${fileName} page ${pageNumber || '?'} (${gptChunk.length} chars)`);

        const pass1Response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: `You are a text cleaning expert. Fix all spacing, formatting, and word-splitting issues in this PDF-extracted text. Make it fluent, natural English.

CRITICAL RULES:
1. Fix words stuck together (e.g., "Theproposed" → "The proposed")
2. Fix excessive spacing in words (e.g., "Environ ment al" → "Environmental")
3. Remove hyphenation from line breaks (e.g., "ex- tracted" → "extracted")
4. Fix common stuck prepositions (e.g., "ideaof" → "idea of", "depthfor" → "depth for")
5. Preserve technical terms, citations, and formatting
6. Return ONLY the corrected text, no explanations

Examples:

Input: "Theproposedmodel allowsaccurate answers tobe ex- tractedbyadd in ga contrastive loss term"
Output: "The proposed model allows accurate answers to be extracted by adding a contrastive loss term"

Input: "Is the ideaofsufﬁcient depthfora course project? Whileyour idea or ﬁxdoes not have to work wonderfully"
Output: "Is the idea of sufficient depth for a course project? While your idea or fix does not have to work wonderfully"

Input: "analysisofthe base system mayoccur when usingthe existing QA model"
Output: "analysis of the base system may occur when using the existing QA model"

Input: "Environ ment al studies have shown sig nifi cant results in re cent years"
Output: "Environmental studies have shown significant results in recent years"

Input: "Thetransform erarchitecture introducedbyVaswanietal.2017revolutionized NLP"
Output: "The transformer architecture introduced by Vaswani et al. 2017 revolutionized NLP"

Input: "ma chine learn ing mod els can be train ed using super vis ed learn ing"
Output: "machine learning models can be trained using supervised learning"

Input: "Wepresenta novel approach that lever ages self-atten tion mecha nisms"
Output: "We present a novel approach that leverages self-attention mechanisms"

Input: "theexperimentalresults demon strate sig nificantim prove ments over base line methods"
Output: "the experimental results demonstrate significant improvements over baseline methods"

Now fix this text:

${gptChunk}`
          }],
        });

        const pass1Cleaned = pass1Response.choices[0].message.content.trim();
        console.log(`   ✅ Pass 1 complete (o1-mini reasoning)`);

        // PASS 2: Use GPT-4o for final grammar, fluency, and polish
        console.log(`   🎨 Pass 2/2: Using GPT-4o for fluency refinement...`);

        const pass2Response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'system',
            content: `You are refining already-cleaned text to ensure perfect grammar and fluency. Fix any remaining issues:

1. Ensure perfect sentence structure
2. Fix any remaining spacing or punctuation issues
3. Ensure natural, academic English
4. Preserve all technical terms and citations exactly
5. Return ONLY the refined text, no explanations

Examples of refinements:

Input: "the results show that model performs well"
Output: "The results show that the model performs well"

Input: "We used approach described in Smith et al.2020"
Output: "We used the approach described in Smith et al. 2020"

Input: "machine learning models.can achieve high accuracy"
Output: "Machine learning models can achieve high accuracy"`
          }, {
            role: 'user',
            content: pass1Cleaned
          }],
          temperature: 0.1,
          max_tokens: 4000,
        });

        const finalCleaned = pass2Response.choices[0].message.content.trim();
        cleanedGptChunks.push(finalCleaned);
        console.log(`   ✅✅ Both passes complete for chunk ${i+1}/${gptChunks.length}`);

      } catch (error) {
        console.error(`   ⚠️ AI cleaning failed for chunk ${i+1}, using regex-cleaned text:`, error.message);
        cleanedGptChunks.push(gptChunk);
      }
    } else {
      cleanedGptChunks.push(gptChunk);
    }
    }

    // Reassemble the cleaned text
    if (gptChunks.length > 1) {
      // Remove overlap regions to avoid duplication
      cleanedText = cleanedGptChunks[0];
      for (let i = 1; i < cleanedGptChunks.length; i++) {
        // Skip first GPT_OVERLAP chars of subsequent chunks (they overlap with previous)
        const chunk = cleanedGptChunks[i];
        cleanedText += ' ' + chunk.substring(Math.min(GPT_OVERLAP, chunk.length));
      }
    } else {
      cleanedText = cleanedGptChunks[0] || cleanedText;
    }

    console.log(`✅ Two-pass GPT-4o cleaning complete`);
  } else {
    console.log(`✨ Using Google Document AI text (no additional cleaning needed)`);
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

// FAST PDF processing - uses only pdfplumber + regex cleaning, no GPT
async function processPDFFast(filePath, fileName, fileSize) {
  console.log(`⚡ FAST MODE: Processing PDF ${fileName} (${Math.round(fileSize / 1024 / 1024)}MB)`);
  const startTime = Date.now();

  // Check if Python is available (won't work on serverless)
  const isServerless = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL;
  const pythonPath = getPythonPath();
  const hasPython = !isServerless && fs.existsSync(pythonPath);

  if (!hasPython) {
    console.log('⚠️ Python not available - falling back to JS extraction');
    return processPDF(filePath, fileName);
  }

  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'extract_pdf_plumber_parallel.py');

    // Execute Python script
    const { stdout, stderr } = await execPromise(
      `"${pythonPath}" "${scriptPath}" "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 200 }
    );

    if (stderr && !stderr.includes('Progress')) {
      console.log('⚠️ pdfplumber warnings:', stderr.substring(0, 200));
    }

    const result = JSON.parse(stdout);

    if (!result.success) {
      throw new Error(result.error || 'pdfplumber extraction failed');
    }

    console.log(`📊 Extracted ${result.total_chars} chars from ${result.total_pages} pages`);

    // Fast chunking - no GPT, just regex cleaning
    const chunks = [];
    for (const pageData of result.pages) {
      if (pageData.text && pageData.text.trim().length > 50) {
        const pageChunks = fastChunkText(
          pageData.text,
          fileName,
          "pdf-fast",
          pageData.page
        );
        chunks.push(...pageChunks);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⚡ FAST MODE complete: ${chunks.length} chunks in ${elapsed}s`);

    return chunks;

  } catch (error) {
    console.log(`⚠️ Fast mode failed: ${error.message}, falling back to standard`);
    // Fall back to standard processing
    return processPDF(filePath, fileName);
  }
}

async function processPDF(filePath, fileName) {
  console.log(`Processing PDF: ${fileName}`);

  const methods = [];

  // Check if Python is available (won't work on Netlify/serverless)
  const isServerless = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL;
  const pythonPath = getPythonPath();
  const hasPython = !isServerless && fs.existsSync(pythonPath);

  if (!hasPython) {
    console.log('⚠️ Python not available (serverless environment) - using JavaScript PDF extraction');
  }

  // Method 1: Try pdfplumber (high-quality extraction, no page limits) - LOCAL ONLY
  if (hasPython) methods.push(async () => {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📘 ATTEMPTING PDFPLUMBER EXTRACTION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Path to Python script - use parallel version for better performance
      const scriptPath = path.join(process.cwd(), 'scripts', 'extract_pdf_plumber_parallel.py');
      const pythonPath = getPythonPath();

      // Execute Python script with increased buffer for large PDFs
      const { stdout, stderr } = await execPromise(
        `"${pythonPath}" "${scriptPath}" "${filePath}"`,
        { maxBuffer: 1024 * 1024 * 200 } // 200MB buffer for very large PDFs
      );

      if (stderr && !stderr.includes('Processed')) {
        console.log('⚠️ pdfplumber warnings:', stderr);
      }

      // Parse result
      const result = JSON.parse(stdout);

      if (!result.success) {
        throw new Error(result.error || 'pdfplumber extraction failed');
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ SUCCESS! PDFPLUMBER EXTRACTION COMPLETE');
      console.log(`📊 Extracted: ${result.total_chars} characters`);
      console.log(`📄 Pages: ${result.total_pages}`);
      console.log('🎯 Text quality: HIGH (with table support)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Process pages
      const chunks = [];
      for (const pageData of result.pages) {
        if (pageData.text.trim().length > 50) {
          const pageChunks = await processTextContent(
            pageData.text,
            fileName,
            "pdf-plumber",
            pageData.page
          );
          chunks.push(...pageChunks);
        }
      }

      if (chunks.length === 0) {
        throw new Error('No text content extracted');
      }

      return chunks;

    } catch (error) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ PDFPLUMBER FAILED');
      console.log(`Error: ${error.message}`);
      console.log('⚠️  Trying PyMuPDF extraction');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      throw error;
    }
  });

  // Method 2: Try PyMuPDF extraction (often cleaner than pdfplumber) - LOCAL ONLY
  if (hasPython) methods.push(async () => {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔷 ATTEMPTING PYMUPDF EXTRACTION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const scriptPath = path.join(process.cwd(), 'scripts', 'extract_pdf_pymupdf.py');
      const pythonPath = getPythonPath();

      // Execute Python script with increased buffer
      const { stdout, stderr } = await execPromise(
        `"${pythonPath}" "${scriptPath}" "${filePath}"`,
        { maxBuffer: 1024 * 1024 * 200 } // 200MB buffer
      );

      if (stderr && !stderr.includes('Processed')) {
        console.log('⚠️ PyMuPDF warnings:', stderr);
      }

      // Parse result
      const result = JSON.parse(stdout);

      if (!result.success) {
        throw new Error(result.error || 'PyMuPDF extraction failed');
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ SUCCESS! PYMUPDF EXTRACTION COMPLETE');
      console.log(`📊 Extracted: ${result.total_chars} characters`);
      console.log(`📄 Pages: ${result.total_pages}`);
      console.log('🎯 Text quality: ENHANCED (with advanced cleaning)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Process pages
      const chunks = [];
      for (const pageData of result.pages) {
        if (pageData.text.trim().length > 50) {
          const pageChunks = await processTextContent(
            pageData.text,
            fileName,
            "pymupdf",
            pageData.page
          );
          chunks.push(...pageChunks);
        }
      }

      if (chunks.length === 0) {
        throw new Error('No text content extracted');
      }

      return chunks;

    } catch (error) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ PYMUPDF FAILED');
      console.log(`Error: ${error.message}`);
      console.log('⚠️  Falling back to pdf2json');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      throw error;
    }
  });

  // Method 3: Try pdf2json
  methods.push(async () => {
    try {
      console.log('📚 Using pdf2json (fallback method)...');
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
      maxFileSize: 1024 * 1024 * 1024 * 1024, // 1TB per file
      maxTotalFileSize: 1024 * 1024 * 1024 * 1024, // 1TB total
      maxFiles: 50, // Allow up to 50 files
      multiples: false, // Single file upload
      allowEmptyFiles: false,
      minFileSize: 1, // Must have content
      hashAlgorithm: false, // Skip hashing to speed up large file uploads
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      // Add progress tracking for large files
      form.on('progress', (bytesReceived, bytesExpected) => {
        const progress = Math.round((bytesReceived / bytesExpected) * 100);
        if (progress % 10 === 0) { // Log every 10%
          console.log(`Upload progress: ${progress}% (${Math.round(bytesReceived / 1024 / 1024)}MB / ${Math.round(bytesExpected / 1024 / 1024)}MB)`);
        }
      });

      form.on('fileBegin', (name, file) => {
        console.log(`Starting file upload: ${file.originalFilename}`);
      });

      // Handle stream errors
      form.on('error', (err) => {
        console.error('Formidable stream error:', err);
        reject(err);
      });

      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Formidable parse error:', err);
          if (err.code === 'LIMIT_FILE_SIZE') {
            reject(new Error('File too large. Maximum size is 100MB.'));
          } else if (err.message?.includes('stream ended unexpectedly')) {
            reject(new Error('Upload interrupted. Please check your connection and try again.'));
          } else {
            reject(err);
          }
        } else {
          resolve([fields, files]);
        }
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

    const fileSize = file.size || 0;
    console.log(`Processing file: ${fileName} (${fileExt}, ${Math.round(fileSize / 1024 / 1024 * 10) / 10}MB)`);

    let documents = [];
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"];

    // Use FAST MODE for PDFs over 2MB - skips GPT cleaning for speed
    const FAST_MODE_THRESHOLD = 2 * 1024 * 1024; // 2MB

    if (fileExt === ".pdf") {
      if (fileSize > FAST_MODE_THRESHOLD) {
        console.log(`⚡ Large PDF detected (${Math.round(fileSize / 1024 / 1024)}MB) - using FAST MODE`);
        documents = await processPDFFast(filePath, fileName, fileSize);
      } else {
        documents = await processPDF(filePath, fileName);
      }
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
    // In fast mode, don't wait for Pinecone indexing (eventual consistency is fine)
    const isFastMode = documents[0]?.metadata?.type === 'pdf-fast';
    const result = await addDocumentsToStore(documents, sessionId, userId, !isFastMode);

    // Read file data as base64 for later viewing - BEFORE deleting file
    // Skip base64 for large PDFs (>10MB) to improve speed and avoid Supabase limits
    const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB
    let fileBase64 = null;
    const imageExtensionsForSave = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
    if (fileExt === '.pdf') {
      if (fileSize > MAX_BASE64_SIZE) {
        console.log(`⚡ Skipping base64 storage for large PDF (${Math.round(fileSize / 1024 / 1024)}MB > 10MB)`);
      } else {
        try {
          const fileBuffer = fs.readFileSync(filePath);
          fileBase64 = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
        } catch (e) {
          console.log('Could not read PDF for base64 encoding:', e);
        }
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

    // Use admin client to bypass RLS (since we use Clerk auth, not Supabase auth)
    const db = supabaseAdmin || supabase;
    try {
      await db.from('uploaded_files').insert({
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

    // Determine processing method for response
    const docType = documents[0]?.metadata?.type || 'unknown';
    let method = 'standard';
    if (docType === 'pdf-fast') {
      method = 'fast';
    } else if (docType === 'image-vision' || docType === 'pdf-vision') {
      method = 'GPT-4 Vision';
    }

    res.status(200).json({
      success: true,
      message: `Successfully processed ${fileName}`,
      chunksAdded: result.count,
      method: method,
      fastMode: docType === 'pdf-fast'
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to process document" });
  }
}