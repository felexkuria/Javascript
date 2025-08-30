# Subtitle Processing Infrastructure
# Auto-generates subtitles for videos uploaded to S3

# Lambda function code archives
data "archive_file" "start_transcribe_zip" {
  type        = "zip"
  output_path = "${path.module}/start_transcribe.zip"
  source {
    content = <<EOF
import json, os, time, urllib.parse, boto3

transcribe = boto3.client('transcribe')

def lambda_handler(event, context):
    print("Event:", json.dumps(event))
    try:
        rec = event['Records'][0]['s3']
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except Exception as e:
        print("Not an S3 put event or missing data:", e)
        return {'status':'ignored'}
    
    # Filter for target folder & media suffixes
    if not key.startswith("videos/dev-ops-bootcamp_202201/"):
        print("Skipping non-target folder:", key)
        return {'status':'skipped'}
    
    if not key.lower().endswith(('.mp4','.mov','.mkv','.avi','.wav','.mp3')):
        print("Skipping non-media:", key)
        return {'status':'skipped'}
    
    base = os.path.splitext(os.path.basename(key))[0]
    job_name = f"{base}__{int(time.time())}"
    media_format = key.split('.')[-1].lower()
    media_uri = f"s3://{bucket}/{key}"
    output_prefix = os.path.dirname(key) + '/'
    
    print("Starting Transcribe job:", job_name, media_uri)
    
    try:
        transcribe.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={'MediaFileUri': media_uri},
            MediaFormat=media_format,
            LanguageCode=os.environ.get('LANGUAGE_CODE', 'en-US'),
            OutputBucketName=bucket,
            OutputKey=output_prefix,
            Subtitles={'Formats':['vtt','srt'],'OutputStartIndex':1}
        )
        print("Transcribe started:", job_name)
        return {'status':'started','job':job_name}
    except Exception as e:
        print("Error starting transcription:", e)
        raise
EOF
    filename = "index.py"
  }
}

data "archive_file" "postprocess_zip" {
  type        = "zip"
  output_path = "${path.module}/postprocess_subtitles.zip"
  source {
    content = <<EOF
import json, os, urllib.parse, boto3

s3 = boto3.client('s3')

def lambda_handler(event, context):
    print("Event:", json.dumps(event))
    
    for rec in event.get('Records', []):
        try:
            bucket = rec['s3']['bucket']['name']
            key = urllib.parse.unquote_plus(rec['s3']['object']['key'])
        except Exception as e:
            print("Skipping record: not an S3 event", e)
            continue
        
        if not (key.endswith('.vtt') or key.endswith('.srt')):
            print("Not a subtitle file; skipping:", key)
            continue
        
        folder = os.path.dirname(key)
        filename = os.path.basename(key)
        
        if '__' not in filename:
            print("No job-timestamp in file; skipping:", filename)
            continue
        
        base_with_ts, ext = os.path.splitext(filename)
        original_base = base_with_ts.split('__',1)[0]
        desired_key = f"{folder}/{original_base}{ext}"
        
        print("Copying", key, "to", desired_key)
        
        try:
            s3.copy_object(
                Bucket=bucket, 
                CopySource={'Bucket':bucket, 'Key':key}, 
                Key=desired_key
            )
            print("Copied subtitle to", desired_key)
        except Exception as e:
            print("Error copying:", e)
EOF
    filename = "index.py"
  }
}

# IAM Role for Start Transcribe Lambda
resource "aws_iam_role" "start_transcribe_role" {
  name = "${var.app_name}-transcribe-starter-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "start_transcribe_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.start_transcribe_role.name
}

resource "aws_iam_role_policy" "start_transcribe_policy" {
  name = "${var.app_name}-transcribe-starter-policy"
  role = aws_iam_role.start_transcribe_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowTranscribe"
        Effect = "Allow"
        Action = [
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowS3Get"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.video_bucket.arn,
          "${aws_s3_bucket.video_bucket.arn}/*"
        ]
      }
    ]
  })
}

# IAM Role for Post Process Lambda
resource "aws_iam_role" "postprocess_role" {
  name = "${var.app_name}-transcribe-postproc-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "postprocess_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.postprocess_role.name
}

resource "aws_iam_role_policy" "postprocess_policy" {
  name = "${var.app_name}-transcribe-postproc-policy"
  role = aws_iam_role.postprocess_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3ReadWrite"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:CopyObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.video_bucket.arn,
          "${aws_s3_bucket.video_bucket.arn}/*"
        ]
      }
    ]
  })
}

# Start Transcribe Lambda Function
resource "aws_lambda_function" "start_transcribe" {
  filename         = data.archive_file.start_transcribe_zip.output_path
  function_name    = "${var.app_name}-start-transcribe"
  role            = aws_iam_role.start_transcribe_role.arn
  handler         = "index.lambda_handler"
  runtime         = "python3.9"
  timeout         = 60
  memory_size     = 512

  source_code_hash = data.archive_file.start_transcribe_zip.output_base64sha256

  environment {
    variables = {
      BUCKET_NAME = aws_s3_bucket.video_bucket.id
      LANGUAGE_CODE = "en-US"
    }
  }

  tags = var.tags
}

# Post Process Lambda Function
resource "aws_lambda_function" "postprocess_subtitles" {
  filename         = data.archive_file.postprocess_zip.output_path
  function_name    = "${var.app_name}-postprocess-subtitles"
  role            = aws_iam_role.postprocess_role.arn
  handler         = "index.lambda_handler"
  runtime         = "python3.9"
  timeout         = 60
  memory_size     = 256

  source_code_hash = data.archive_file.postprocess_zip.output_base64sha256

  environment {
    variables = {
      BUCKET_NAME = aws_s3_bucket.video_bucket.id
    }
  }

  tags = var.tags
}

# Lambda Permission for S3 to invoke Start Transcribe
resource "aws_lambda_permission" "s3_invoke_start_transcribe" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.start_transcribe.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.video_bucket.arn
}

# Lambda Permission for S3 to invoke Post Process
resource "aws_lambda_permission" "s3_invoke_postprocess" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.postprocess_subtitles.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.video_bucket.arn
}

# S3 Bucket Notification Configuration
resource "aws_s3_bucket_notification" "subtitle_notifications" {
  bucket = aws_s3_bucket.video_bucket.id

  lambda_function {
    id                  = "start-transcribe-mp4"
    lambda_function_arn = aws_lambda_function.start_transcribe.arn
    events              = ["s3:ObjectCreated:Put"]
    filter_prefix       = "videos/dev-ops-bootcamp_202201/"
    filter_suffix       = ".mp4"
  }

  lambda_function {
    id                  = "postprocess-vtt"
    lambda_function_arn = aws_lambda_function.postprocess_subtitles.arn
    events              = ["s3:ObjectCreated:Put"]
    filter_prefix       = "videos/"
    filter_suffix       = ".vtt"
  }

  lambda_function {
    id                  = "postprocess-srt"
    lambda_function_arn = aws_lambda_function.postprocess_subtitles.arn
    events              = ["s3:ObjectCreated:Put"]
    filter_prefix       = "videos/"
    filter_suffix       = ".srt"
  }

  depends_on = [
    aws_lambda_permission.s3_invoke_start_transcribe,
    aws_lambda_permission.s3_invoke_postprocess
  ]
}

# S3 Bucket Policy for Transcribe Service
resource "aws_s3_bucket_policy" "transcribe_policy" {
  bucket = aws_s3_bucket.video_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowTranscribeToWrite"
        Effect = "Allow"
        Principal = {
          Service = "transcribe.amazonaws.com"
        }
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.video_bucket.arn}/*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}