import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    // Get the processing record
    const { data: record, error: fetchError } = await supabase
      .from('file_processing')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Processing record not found' });
    }

    // Update status to processing
    await supabase
      .from('file_processing')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', fileId);

    // Run ECS Fargate task
    const command = new RunTaskCommand({
      cluster: process.env.AWS_ECS_CLUSTER,
      taskDefinition: process.env.AWS_ECS_TASK_DEFINITION,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: process.env.AWS_SUBNETS?.split(',') || [],
          securityGroups: process.env.AWS_SECURITY_GROUPS?.split(',') || [],
          assignPublicIp: 'ENABLED',
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: 'pdf-processor',
            environment: [
              { name: 'FILE_ID', value: fileId },
              { name: 'S3_KEY', value: record.s3_key },
              { name: 'S3_BUCKET', value: process.env.AWS_S3_BUCKET },
              { name: 'USER_ID', value: userId },
              { name: 'SESSION_ID', value: record.session_id },
              { name: 'FILE_NAME', value: record.file_name },
              { name: 'SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL },
              { name: 'SUPABASE_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
              { name: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY },
              { name: 'PINECONE_API_KEY', value: process.env.PINECONE_API_KEY },
              { name: 'PINECONE_INDEX_NAME', value: process.env.PINECONE_INDEX_NAME },
            ],
          },
        ],
      },
    });

    const result = await ecsClient.send(command);

    // Store the task ARN for tracking
    const taskArn = result.tasks?.[0]?.taskArn;
    if (taskArn) {
      await supabase
        .from('file_processing')
        .update({ ecs_task_arn: taskArn })
        .eq('id', fileId);
    }

    return res.status(200).json({
      success: true,
      fileId,
      taskArn,
      status: 'processing',
    });

  } catch (error) {
    console.error('Error triggering ECS task:', error);

    // Update status to failed
    if (req.body.fileId) {
      await supabase
        .from('file_processing')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', req.body.fileId);
    }

    return res.status(500).json({ error: error.message });
  }
}
