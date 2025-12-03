import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { fileName, fileType, fileSize, sessionId } = req.body;

    if (!fileName || !sessionId) {
      return res.status(400).json({ error: 'fileName and sessionId are required' });
    }

    // Generate unique file key
    const fileId = uuidv4();
    const fileExtension = fileName.split('.').pop();
    const s3Key = `uploads/${userId}/${sessionId}/${fileId}.${fileExtension}`;

    // Create presigned URL for upload (valid for 1 hour)
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType || 'application/octet-stream',
      Metadata: {
        'user-id': userId,
        'session-id': sessionId,
        'original-filename': encodeURIComponent(fileName),
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Create a pending processing record in Supabase
    const { data: processingRecord, error: dbError } = await supabase
      .from('file_processing')
      .insert({
        id: fileId,
        user_id: userId,
        session_id: sessionId,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        s3_key: s3Key,
        status: 'pending_upload',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to create processing record');
    }

    return res.status(200).json({
      uploadUrl,
      fileId,
      s3Key,
    });

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return res.status(500).json({ error: error.message });
  }
}
