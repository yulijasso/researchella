# AWS S3 + ECS Fargate Setup for Large File Processing

This guide sets up AWS infrastructure to process large PDF files without timeout limits.

## Architecture

```
User → Upload to S3 (presigned URL) → Trigger ECS Fargate → Process PDF → Store in Pinecone
                                                                            ↓
                                                                    Update Supabase
```

## Prerequisites

- AWS Account
- AWS CLI installed and configured
- Docker installed (for building processor image)

## Step 1: Create S3 Bucket

```bash
# Create bucket (replace YOUR_BUCKET_NAME with a unique name)
aws s3 mb s3://researchella-uploads --region us-east-1

# Enable CORS for presigned URL uploads
aws s3api put-bucket-cors --bucket researchella-uploads --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["PUT", "POST", "GET"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}'
```

## Step 2: Create ECR Repository & Push Image

```bash
# Create ECR repository
aws ecr create-repository --repository-name researchella-processor --region us-east-1

# Get login command
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build and push image
cd aws-processor
docker build -t researchella-processor .
docker tag researchella-processor:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/researchella-processor:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/researchella-processor:latest
```

## Step 3: Create ECS Cluster

```bash
# Create cluster
aws ecs create-cluster --cluster-name researchella-cluster --region us-east-1
```

## Step 4: Create IAM Role for ECS Task

Create a file `task-role-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::researchella-uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

```bash
# Create role
aws iam create-role --role-name researchella-task-role --assume-role-policy-document '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}'

# Attach policy
aws iam put-role-policy --role-name researchella-task-role --policy-name S3Access --policy-document file://task-role-policy.json

# Attach execution role policy
aws iam attach-role-policy --role-name researchella-task-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

## Step 5: Create Task Definition

Create `task-definition.json`:
```json
{
  "family": "researchella-processor",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "4096",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/researchella-task-role",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/researchella-task-role",
  "containerDefinitions": [
    {
      "name": "pdf-processor",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/researchella-processor:latest",
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/researchella-processor",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

```bash
# Create CloudWatch log group
aws logs create-log-group --log-group-name /ecs/researchella-processor --region us-east-1

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

## Step 6: Create VPC & Security Group (if needed)

```bash
# Get default VPC
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# Get subnets
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text | tr '\t' ',')

# Create security group
SG_ID=$(aws ec2 create-security-group --group-name researchella-ecs-sg --description "Security group for ECS tasks" --vpc-id $VPC_ID --query "GroupId" --output text)

# Allow outbound traffic
aws ec2 authorize-security-group-egress --group-id $SG_ID --protocol all --port all --cidr 0.0.0.0/0
```

## Step 7: Create IAM User for App

```bash
# Create user
aws iam create-user --user-name researchella-app

# Create access key
aws iam create-access-key --user-name researchella-app

# Attach policies
aws iam attach-user-policy --user-name researchella-app --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
aws iam attach-user-policy --user-name researchella-app --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess
```

## Step 8: Add Environment Variables

Add these to your `.env.local` and deployment platform:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=researchella-uploads
AWS_ECS_CLUSTER=researchella-cluster
AWS_ECS_TASK_DEFINITION=researchella-processor
AWS_SUBNETS=subnet-xxx,subnet-yyy
AWS_SECURITY_GROUPS=sg-xxx

# Enable S3 upload for large files
NEXT_PUBLIC_USE_S3_UPLOAD=true
```

## Step 9: Run Supabase Migration

Run this SQL in Supabase SQL Editor:

```sql
-- See supabase-migrations/create_file_processing_table.sql
```

## Step 10: Test

1. Upload a large PDF (>20MB)
2. File goes directly to S3
3. ECS Fargate task starts processing
4. Frontend polls for status
5. File appears in sources when complete

## Costs

- **S3**: ~$0.023/GB stored, $0.0004/1000 PUT requests
- **ECS Fargate**: ~$0.04/hour (1 vCPU, 4GB RAM)
- **ECR**: $0.10/GB stored

Typical cost: ~$0.05-0.10 per large PDF processed

## Troubleshooting

### Check ECS Task Logs
```bash
aws logs get-log-events --log-group-name /ecs/researchella-processor --log-stream-name ecs/pdf-processor/TASK_ID
```

### Check Task Status
```bash
aws ecs describe-tasks --cluster researchella-cluster --tasks TASK_ARN
```

### Common Issues

1. **Task fails to start**: Check IAM roles and security group
2. **S3 access denied**: Check bucket policy and CORS
3. **Timeout**: Increase task CPU/memory
