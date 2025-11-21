import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get the most recent uploaded file for testing
    const uploadDir = path.join(process.cwd(), "data", "uploads");

    if (!fs.existsSync(uploadDir)) {
      return res.status(200).json({
        message: "No uploads directory found",
        tip: "Upload a file first"
      });
    }

    const files = fs.readdirSync(uploadDir);

    if (files.length === 0) {
      return res.status(200).json({
        message: "No files found in uploads directory",
        tip: "Upload a file first"
      });
    }

    // Get the first PDF file
    const pdfFile = files.find(f => f.endsWith('.pdf'));

    if (!pdfFile) {
      return res.status(200).json({
        message: "No PDF files found",
        files: files
      });
    }

    const filePath = path.join(uploadDir, pdfFile);
    const dataBuffer = fs.readFileSync(filePath);

    // Try different extraction methods
    const results = {};

    // Method 1: Raw binary text extraction
    try {
      const text = dataBuffer.toString('utf8');
      const readable = text.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ');
      results.rawExtraction = {
        success: true,
        length: readable.length,
        sample: readable.substring(0, 500),
        hasText: readable.length > 100
      };
    } catch (e) {
      results.rawExtraction = { success: false, error: e.message };
    }

    // Method 2: Look for text between parentheses (PDF text strings)
    try {
      const text = dataBuffer.toString('binary');
      const matches = text.match(/\(([^)]+)\)/g);
      if (matches) {
        const extracted = matches
          .map(m => m.slice(1, -1))
          .filter(t => t.length > 2 && /[a-zA-Z]/.test(t))
          .join(' ');

        results.parenthesesExtraction = {
          success: true,
          matchCount: matches.length,
          extractedLength: extracted.length,
          sample: extracted.substring(0, 500),
          hasUsableText: extracted.length > 100
        };
      } else {
        results.parenthesesExtraction = { success: false, message: "No text found in parentheses" };
      }
    } catch (e) {
      results.parenthesesExtraction = { success: false, error: e.message };
    }

    // Method 3: Look for BT/ET blocks
    try {
      const text = dataBuffer.toString('binary');
      const textBlocks = text.match(/BT[\s\S]*?ET/g);
      if (textBlocks) {
        results.btEtBlocks = {
          success: true,
          blockCount: textBlocks.length,
          firstBlock: textBlocks[0]?.substring(0, 200)
        };
      } else {
        results.btEtBlocks = { success: false, message: "No BT/ET blocks found" };
      }
    } catch (e) {
      results.btEtBlocks = { success: false, error: e.message };
    }

    // Check for font issues
    const fontWarnings = dataBuffer.toString('binary').match(/Type3|CIDFont|TrueType/g);
    if (fontWarnings) {
      results.fontInfo = {
        hasType3Fonts: fontWarnings.includes('Type3'),
        hasCIDFonts: fontWarnings.includes('CIDFont'),
        hasTrueType: fontWarnings.includes('TrueType'),
        warning: "PDF uses custom fonts that may not extract properly"
      };
    }

    res.status(200).json({
      file: pdfFile,
      fileSize: dataBuffer.length,
      results,
      recommendation: results.rawExtraction?.hasText || results.parenthesesExtraction?.hasUsableText
        ? "Text extraction possible but may be garbled due to font encoding"
        : "This PDF appears to be image-based or uses heavily encoded fonts. Consider using OCR or converting to text format."
    });

  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({ error: error.message });
  }
}