# IAM role for Lambda functions
resource "aws_iam_role" "lambda_role" {
  name = "video-course-lambda-role"
  
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
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "video-course-lambda-policy"
  role = aws_iam_role.lambda_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem"
        ]
        Resource = "arn:aws:dynamodb:*:*:table/video-course-app-*"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:CopyObject"
        ]
        Resource = "arn:aws:s3:::video-course-bucket-047ad47c/*"
      }
    ]
  })
}

# Lambda function to start transcription
resource "aws_lambda_function" "start_transcribe" {
  filename         = data.archive_file.start_transcribe_zip.output_path
  function_name    = "video-course-start-transcribe"
  role            = aws_iam_role.lambda_role.arn
  handler         = "start_transcribe.lambda_handler"
  runtime         = "python3.9"
  timeout         = 60
  
  source_code_hash = data.archive_file.start_transcribe_zip.output_base64sha256
  
  environment {
    variables = {
      LANGUAGE_CODE = "en-US"
    }
  }
}

# Lambda function to postprocess subtitles
resource "aws_lambda_function" "postprocess_subtitles" {
  filename         = data.archive_file.postprocess_zip.output_path
  function_name    = "video-course-postprocess-subtitles"
  role            = aws_iam_role.lambda_role.arn
  handler         = "postprocess_subtitles.lambda_handler"
  runtime         = "python3.9"
  timeout         = 60
  
  source_code_hash = data.archive_file.postprocess_zip.output_base64sha256
}

# Lambda function to add video to DynamoDB
resource "aws_lambda_function" "add_video_to_db" {
  filename         = data.archive_file.add_video_to_db_zip.output_path
  function_name    = "video-course-add-video-to-db"
  role            = aws_iam_role.lambda_role.arn
  handler         = "add_video_to_db.lambda_handler"
  runtime         = "python3.9"
  timeout         = 30
  
  source_code_hash = data.archive_file.add_video_to_db_zip.output_base64sha256
  
  environment {
    variables = {
      NODE_ENV = var.environment
    }
  }
}

# Lambda permissions for S3
resource "aws_lambda_permission" "s3_invoke_start_transcribe" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.start_transcribe.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::video-course-bucket-047ad47c"
}

resource "aws_lambda_permission" "s3_invoke_postprocess" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.postprocess_subtitles.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::video-course-bucket-047ad47c"
}

resource "aws_lambda_permission" "s3_invoke_add_video" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.add_video_to_db.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::video-course-bucket-047ad47c"
}

# S3 bucket notification for video uploads
resource "aws_s3_bucket_notification" "video_upload" {
  bucket = "video-course-bucket-047ad47c"
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.start_transcribe.arn
    events             = ["s3:ObjectCreated:*"]
    filter_prefix      = "videos/dev-ops-bootcamp_202201/"
    filter_suffix      = ".mp4"
  }
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.add_video_to_db.arn
    events             = ["s3:ObjectCreated:*"]
    filter_prefix      = "videos/"
    filter_suffix      = ".mov"
  }
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.add_video_to_db.arn
    events             = ["s3:ObjectCreated:*"]
    filter_prefix      = "videos/"
    filter_suffix      = ".avi"
  }
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.add_video_to_db.arn
    events             = ["s3:ObjectCreated:*"]
    filter_prefix      = "videos/"
    filter_suffix      = ".webm"
  }
}