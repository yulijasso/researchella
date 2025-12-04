import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';
import { supabaseAdmin } from '../../lib/supabaseServer';
import { addDocumentsToStore } from '../../lib/vectorStore';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import officeParser from 'officeparser';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Use admin client to bypass RLS (since we use Clerk auth, not Supabase auth)
  const db = supabaseAdmin || supabase;

  try {
    const { downloadUrl, fileName, mimeType, accessToken, sessionId } = req.body;

    if (!downloadUrl || !accessToken || !sessionId) {
      return res.status(400).json({ error: 'Download URL, access token, and session ID are required' });
    }

    console.log(`📥 Downloading file from OneDrive: ${fileName} (${mimeType})`);

    // Download the file from OneDrive
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OneDrive API error:', errorText);
      return res.status(400).json({
        error: 'Failed to download file from OneDrive',
        details: errorText
      });
    }

    let content = '';
    const buffer = Buffer.from(await response.arrayBuffer());
    let pdfDataBase64 = null;

    // Store PDF data for viewing later
    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      pdfDataBase64 = `data:application/pdf;base64,${buffer.toString('base64')}`;
      console.log(`📎 Stored PDF data (${Math.round(buffer.length / 1024)}KB)`);
    }

    // Check if it's an Office/PDF file that officeParser can handle
    const isOfficeFile = OFFICE_MIME_TYPES.includes(mimeType) ||
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
          type: 'onedrive',
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
      name: fileName,
      type: 'onedrive',
      chunks: chunks.length,
    };

    // Store PDF data in database for viewing later
    if (pdfDataBase64) {
      insertData.pdf_data = pdfDataBase64;
    }

    const { data: fileData, error: dbError } = await db
      .from('uploaded_files')
      .insert(insertData)
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log(`✅ Successfully added OneDrive file: ${fileName}`);

    return res.status(200).json({
      success: true,
      chunks: chunks.length,
      fileId: fileData.id,
      fileName: fileName,
      isPdf: isPdf,
      pdfData: pdfDataBase64,
    });

  } catch (error) {
    console.error('Error downloading from OneDrive:', error);
    return res.status(500).json({
      error: 'Failed to process OneDrive file',
      details: error.message
    });
  }
}
