import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';
import { addDocumentsToStore } from '../../lib/vectorStore';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import officeParser from 'officeparser';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

const execPromise = promisify(exec);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
    responseLimit: false,
  },
  maxDuration: 300, // 5 minutes for large files
};

// Get Python path at runtime to avoid Turbopack static analysis of venv symlinks
function getPythonPath() {
  // Construct path at runtime using array join to prevent static analysis
  const parts = [process.cwd(), 'venv', 'bin', 'python3'];
  return parts.join(path.sep);
}

// Supported file types for officeParser
const OFFICE_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/msword', // .doc
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.oasis.opendocument.text', // .odt
  'application/vnd.oasis.opendocument.spreadsheet', // .ods
  'application/vnd.oasis.opendocument.presentation', // .odp
];

// Check if Python is available
function isPythonAvailable() {
  const isServerless = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL;
  if (isServerless) return false;

  const pythonPath = getPythonPath();
  return fs.existsSync(pythonPath);
}

// Fast PDF processing using pdfplumber (for large PDFs like textbooks)
async function processPDFFast(filePath, fileName) {
  console.log(`⚡ FAST MODE: Processing large PDF ${fileName}`);
  const startTime = Date.now();

  // Check if Python is available
  if (!isPythonAvailable()) {
    console.log('⚠️ Python not available - falling back to officeParser');
    return null; // Signal to use fallback
  }

  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'extract_pdf_plumber.py');
    const pythonPath = getPythonPath();

    console.log(`🐍 Using Python: ${pythonPath}`);
    console.log(`📜 Script: ${scriptPath}`);

    // Execute Python script with large buffer
    const { stdout, stderr } = await execPromise(
      `"${pythonPath}" "${scriptPath}" "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 200, timeout: 300000 } // 200MB buffer, 5 min timeout
    );

    if (stderr && !stderr.includes('Processed') && !stderr.includes('Progress')) {
      console.log('⚠️ pdfplumber warnings:', stderr.substring(0, 200));
    }

    const result = JSON.parse(stdout);

    if (!result.success) {
      throw new Error(result.error || 'pdfplumber extraction failed');
    }

    console.log(`📊 Extracted ${result.total_chars} chars from ${result.total_pages} pages in ${Date.now() - startTime}ms`);

    // Combine all page text
    let fullText = '';
    for (const pageData of result.pages) {
      if (pageData.text && pageData.text.trim().length > 0) {
        fullText += pageData.text + '\n\n';
      }
    }

    return {
      content: fullText,
      pageCount: result.total_pages,
      charCount: result.total_chars,
    };
  } catch (error) {
    console.error('Fast PDF processing error:', error);
    console.log('⚠️ Python processing failed - will try officeParser fallback');
    return null; // Signal to use fallback
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { fileId, fileName, mimeType, accessToken, sessionId } = req.body;

    if (!fileId || !accessToken || !sessionId) {
      return res.status(400).json({ error: 'File ID, access token, and session ID are required' });
    }

    console.log(`📥 Downloading file from Google Drive: ${fileName} (${mimeType})`);

    // Determine the export URL based on mime type
    let downloadUrl;
    let exportMimeType = mimeType;
    let isGoogleWorkspaceFile = false;

    // Google Workspace files - use DIRECT EXPORT URLs (bypasses 10MB API limit!)
    // Reference: https://stackoverflow.com/questions/50612407/strategies-to-googledrive-api-limit-export-download-10-mb
    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs -> export as docx via direct URL (no size limit)
      downloadUrl = `https://docs.google.com/document/d/${fileId}/export?format=docx`;
      exportMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      isGoogleWorkspaceFile = true;
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets -> export as xlsx via direct URL (no size limit)
      downloadUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
      exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      isGoogleWorkspaceFile = true;
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      // Google Slides -> export as pptx via direct URL (no size limit)
      downloadUrl = `https://docs.google.com/presentation/d/${fileId}/export/pptx`;
      exportMimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      isGoogleWorkspaceFile = true;
    } else {
      // Regular files - direct download
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }

    // Download the file from Google Drive
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Drive API error:', errorText);

      // Check if it's a size limit error for Google Docs
      let isSizeLimitError = false;
      try {
        const errorJson = JSON.parse(errorText);
        isSizeLimitError = errorJson.error?.reason === 'exportSizeLimitExceeded' ||
                          errorJson.error?.message?.includes('too large to be exported');
      } catch (e) {}

      // For large Google Docs, try using the Google Docs API to read content directly
      if (isSizeLimitError && mimeType === 'application/vnd.google-apps.document') {
        console.log('📄 Export failed due to size limit. Trying Google Docs API...');

        try {
          const docsApiUrl = `https://docs.googleapis.com/v1/documents/${fileId}`;
          const docsResponse = await fetch(docsApiUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (docsResponse.ok) {
            const docData = await docsResponse.json();

            // Extract text content from Google Docs JSON structure
            let extractedContent = '';

            const extractText = (elements) => {
              if (!elements) return;
              for (const element of elements) {
                if (element.paragraph) {
                  for (const elem of element.paragraph.elements || []) {
                    if (elem.textRun?.content) {
                      extractedContent += elem.textRun.content;
                    }
                  }
                }
                if (element.table) {
                  for (const row of element.table.tableRows || []) {
                    for (const cell of row.tableCells || []) {
                      extractText(cell.content);
                    }
                  }
                }
              }
            };

            extractText(docData.body?.content);

            if (extractedContent.trim().length > 0) {
              console.log(`✅ Extracted ${extractedContent.length} characters via Google Docs API`);

              // Process the extracted content
              const textSplitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1000,
                chunkOverlap: 200,
              });

              const chunks = await textSplitter.splitText(extractedContent);
              console.log(`✂️ Split into ${chunks.length} chunks`);

              // Add to vector store
              await addDocumentsToStore(
                chunks.map(chunk => ({
                  content: chunk,
                  metadata: {
                    source: fileName,
                    type: 'google-drive',
                    fileId: fileId,
                    mimeType: mimeType,
                  }
                })),
                sessionId,
                userId
              );

              // Save to database
              const { data: fileData, error: dbError } = await supabase
                .from('uploaded_files')
                .insert({
                  user_id: userId,
                  session_id: sessionId,
                  name: `${fileName}||gdrive:${fileId}`,
                  type: 'google-drive',
                  chunks: chunks.length,
                })
                .select()
                .single();

              if (dbError) {
                console.error('Database error:', dbError);
                throw dbError;
              }

              console.log(`✅ Successfully added large Google Doc: ${fileName}`);

              return res.status(200).json({
                success: true,
                chunks: chunks.length,
                fileId: fileData.id,
                fileName: fileName,
                isPdf: false,
              });
            }
          }
        } catch (docsApiError) {
          console.error('Google Docs API fallback error:', docsApiError);
        }
      }

      // If we get here, we couldn't handle it
      let errorMessage = 'Failed to download file from Google Drive';
      try {
        const errorJson = JSON.parse(errorText);
        if (isSizeLimitError) {
          errorMessage = `This Google Docs file is too large to export. Please download it manually from Google Drive as PDF and upload directly.`;
        } else if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch (e) {}

      return res.status(400).json({
        error: errorMessage,
        details: errorText
      });
    }

    let content = '';
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileSizeMB = buffer.length / (1024 * 1024);
    let pdfDataBase64 = null;

    // Store PDF data for viewing later (skip for large files >10MB)
    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const MAX_PDF_STORE_SIZE = 10 * 1024 * 1024; // 10MB
    if (isPdf && buffer.length <= MAX_PDF_STORE_SIZE) {
      pdfDataBase64 = `data:application/pdf;base64,${buffer.toString('base64')}`;
      console.log(`📎 Stored PDF data (${Math.round(buffer.length / 1024)}KB)`);
    } else if (isPdf) {
      console.log(`📎 Skipping PDF storage for large file (${fileSizeMB.toFixed(1)}MB)`);
    }

    // For large PDFs (>5MB), try fast pdfplumber processing first
    const FAST_MODE_THRESHOLD = 5 * 1024 * 1024; // 5MB
    let usedFastMode = false;

    if (isPdf && buffer.length > FAST_MODE_THRESHOLD) {
      console.log(`📚 Large PDF detected (${fileSizeMB.toFixed(1)}MB) - trying fast mode`);

      // Save to temp file
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `gdrive-${Date.now()}-${fileName}`);

      try {
        fs.writeFileSync(tempFilePath, buffer);
        console.log(`💾 Saved to temp: ${tempFilePath}`);

        // Use fast pdfplumber processing
        const result = await processPDFFast(tempFilePath, fileName);

        if (result && result.content) {
          content = result.content;
          usedFastMode = true;
          console.log(`✅ Fast mode extracted ${result.charCount} chars from ${result.pageCount} pages`);
        } else {
          console.log(`⚠️ Fast mode returned null - will use officeParser`);
        }
      } catch (fastError) {
        console.error('Fast mode error:', fastError);
      } finally {
        // Clean up temp file
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (e) {
          console.log('Temp file cleanup warning:', e.message);
        }
      }
    }

    // Use officeParser if fast mode wasn't used or failed
    if (!usedFastMode) {
      // Check if it's an Office/PDF file that officeParser can handle
      const isOfficeFile = OFFICE_MIME_TYPES.includes(exportMimeType) ||
                           OFFICE_MIME_TYPES.includes(mimeType) ||
                           isGoogleWorkspaceFile ||
                           fileName.match(/\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp)$/i);

      if (isOfficeFile) {
        // Use officeParser for PDF, Word, Excel, PowerPoint, OpenDocument
        try {
          console.log(`📄 Parsing with officeParser...`);
          content = await officeParser.parseOfficeAsync(buffer);
          console.log(`📄 Extracted ${content.length} characters`);
        } catch (parseError) {
          console.error('officeParser error:', parseError);
          // Fallback: try to read as text
          try {
            content = buffer.toString('utf-8');
            if (content.includes('\x00') || content.length < 10) {
              throw new Error('Binary file could not be parsed');
            }
          } catch (e) {
            return res.status(400).json({
              error: 'Failed to parse file',
              details: parseError.message
            });
          }
        }
      } else if (mimeType?.startsWith('text/') || mimeType === 'application/json') {
        // Text-based files
        content = buffer.toString('utf-8');
        console.log(`📄 Read ${content.length} characters of text`);
      } else {
        // Try officeParser as fallback for unknown types
        try {
          content = await officeParser.parseOfficeAsync(buffer);
          console.log(`📄 Extracted ${content.length} characters (fallback)`);
        } catch (e) {
          // Last resort: try as text
          content = buffer.toString('utf-8');
          if (content.includes('\x00')) {
            return res.status(400).json({
              error: 'Unsupported file type',
              details: `Cannot parse file with mime type: ${mimeType}`
            });
          }
        }
      }
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'File appears to be empty or could not be read' });
    }

    // Split content into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await textSplitter.splitText(content);
    console.log(`✂️ Split into ${chunks.length} chunks`);

    // Add to vector store
    await addDocumentsToStore(
      chunks.map(chunk => ({
        content: chunk,
        metadata: {
          source: fileName,
          type: 'google-drive',
          fileId: fileId,
          mimeType: mimeType,
        }
      })),
      sessionId,
      userId
    );

    // Save to database (include pdf_data for PDFs)
    const insertData = {
      user_id: userId,
      session_id: sessionId,
      name: `${fileName}||gdrive:${fileId}`,
      type: 'google-drive',
      chunks: chunks.length,
    };

    // Store PDF data in database for viewing later
    if (pdfDataBase64) {
      insertData.pdf_data = pdfDataBase64;
    }

    const { data: fileData, error: dbError } = await supabase
      .from('uploaded_files')
      .insert(insertData)
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log(`✅ Successfully added Google Drive file: ${fileName}`);

    return res.status(200).json({
      success: true,
      chunks: chunks.length,
      fileId: fileData.id,
      fileName: fileName,
      isPdf: isPdf,
      pdfData: pdfDataBase64, // Return PDF data for viewing
    });

  } catch (error) {
    console.error('Error downloading from Google Drive:', error);
    return res.status(500).json({
      error: 'Failed to process Google Drive file',
      details: error.message
    });
  }
}
