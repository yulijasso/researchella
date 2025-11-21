import Tesseract from 'tesseract.js';
import { createCanvas } from 'canvas';

// OCR processor for extracting text from images
export async function performOCR(imageData, options = {}) {
  const {
    language = 'eng',
    pageNumber = 1,
    onProgress = () => {}
  } = options;

  try {
    console.log(`Starting OCR for page ${pageNumber}...`);

    const result = await Tesseract.recognize(
      imageData,
      language,
      {
        logger: (m) => {
          // Log progress
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            console.log(`OCR Progress (Page ${pageNumber}): ${progress}%`);
            onProgress(progress, pageNumber);
          }
        }
      }
    );

    console.log(`OCR completed for page ${pageNumber}. Confidence: ${result.data.confidence}%`);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      pageNumber
    };
  } catch (error) {
    console.error(`OCR failed for page ${pageNumber}:`, error);
    throw error;
  }
}

// Convert PDF page to image for OCR processing
export async function pdfPageToImage(page) {
  const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR accuracy
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;

  return canvas.toBuffer('image/png');
}

// Process multiple pages with OCR
export async function processWithOCR(pages, onProgress = () => {}) {
  const results = [];

  for (let i = 0; i < pages.length; i++) {
    const pageNumber = i + 1;

    try {
      const imageBuffer = await pdfPageToImage(pages[i]);
      const ocrResult = await performOCR(imageBuffer, {
        pageNumber,
        onProgress
      });

      results.push(ocrResult);
    } catch (error) {
      console.error(`Failed to process page ${pageNumber}:`, error);
      // Continue with other pages even if one fails
      results.push({
        text: '',
        confidence: 0,
        pageNumber,
        error: error.message
      });
    }
  }

  return results;
}