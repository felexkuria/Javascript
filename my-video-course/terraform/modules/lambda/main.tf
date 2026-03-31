# Lambda source code generation
# Ensure the output directory exists at plan time
resource "null_resource" "lambda_src_dir" {
  provisioner "local-exec" {
    command = "mkdir -p ${path.module}/lambda_src"
  }
  triggers = { always = timestamp() }
}
resource "local_file" "start_transcribe_py" {
  filename   = "${path.module}/lambda_src/start_transcribe.py"
  depends_on = [null_resource.lambda_src_dir]
  content  = <<EOF
import json, os, time, urllib.parse, boto3

transcribe = boto3.client('transcribe')

def lambda_handler(event, context):
    try:
        rec = event['Records'][0]['s3']
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except Exception as e:
        return {'status': 'ignored'}
    
    if not (key.startswith("videos/dev-ops-bootcamp_202201/") or key.startswith("videos/AWS CLOUD SOLUTIONS ARCHITECT/")):
        return {'status': 'skipped'}
    
    if not key.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.wav', '.mp3')):
        return {'status': 'skipped'}
    
    base = os.path.splitext(os.path.basename(key))[0]
    job_name = f"{base}__{int(time.time())}"
    media_format = key.split('.')[-1].lower()
    media_uri = f"s3://{bucket}/{key}"
    output_prefix = os.path.dirname(key) + '/'
    
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': media_uri},
        MediaFormat=media_format,
        LanguageCode=os.environ.get('LANGUAGE_CODE', 'en-US'),
        OutputBucketName=bucket,
        OutputKey=output_prefix,
        Subtitles={'Formats': ['vtt', 'srt'], 'OutputStartIndex': 1}
    )
    return {'status': 'started', 'job': job_name}
EOF
}

resource "local_file" "postprocess_py" {
  filename   = "${path.module}/lambda_src/postprocess_subtitles.py"
  depends_on = [null_resource.lambda_src_dir]
  content  = <<EOF
import json, os, urllib.parse, boto3

s3 = boto3.client('s3')

def lambda_handler(event, context):
    for rec in event.get('Records', []):
        try:
            bucket = rec['s3']['bucket']['name']
            key = urllib.parse.unquote_plus(rec['s3']['object']['key'])
        except Exception:
            continue
        
        if not (key.endswith('.vtt') or key.endswith('.srt')):
            continue
        
        folder = os.path.dirname(key)
        filename = os.path.basename(key)
        
        if '__' not in filename:
            continue
        
        base_with_ts, ext = os.path.splitext(filename)
        original_base = base_with_ts.split('__', 1)[0]
        desired_key = f"{folder}/{original_base}{ext}"
        
        s3.copy_object(
            Bucket=bucket,
            CopySource={'Bucket': bucket, 'Key': key},
            Key=desired_key
        )
EOF
}

resource "local_file" "add_video_to_db_py" {
  filename   = "${path.module}/lambda_src/add_video_to_db.py"
  depends_on = [null_resource.lambda_src_dir]
  content  = <<EOF
import json, os, urllib.parse, boto3, re

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    try:
        rec = event['Records'][0]['s3']
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except Exception:
        return {'status': 'ignored'}
    
    if not key.startswith("videos/") or not key.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.webm')):
        return {'status': 'skipped'}
    
    path_parts = key.split('/')
    course_folder = path_parts[1]
    course_name = course_folder.split('_')[0]
    filename = os.path.basename(key)
    title = os.path.splitext(filename)[0]
    
    video_data = {
        'courseName': course_name,
        'videoId': f"{course_name}_{title}_{int(context.aws_request_id.replace('-', '')[:8], 16)}",
        'title': title.replace('_', ' ').title(),
        'videoUrl': key,
        'watched': False
    }
    
    table_name = os.environ.get('DYNAMODB_TABLE')
    table = dynamodb.Table(table_name)
    table.put_item(Item=video_data)
    return {'status': 'success'}
EOF
}

resource "local_file" "extract_thumbnail_py" {
  filename   = "${path.module}/lambda_src/extract_thumbnail.py"
  depends_on = [null_resource.lambda_src_dir]
  content  = <<EOF
import json, os, subprocess, shlex, boto3, urllib.parse

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    try:
        if 'Sns' in event['Records'][0]:
            sns_msg = json.loads(event['Records'][0]['Sns']['Message'])
            rec = sns_msg['Records'][0]['s3']
        else:
            rec = event['Records'][0]['s3']
            
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except Exception as e:
        print(f"Error parsing event: {str(e)}")
        return {'status': 'ignored'}

    if not key.startswith("videos/") or not key.lower().endswith(('.mp4', '.mov', '.mkv')):
        return {'status': 'skipped'}

    video_path = f"/tmp/{os.path.basename(key)}"
    thumb_filename = os.path.splitext(os.path.basename(key))[0] + ".jpg"
    thumb_path = f"/tmp/{thumb_filename}"
    
    path_parts = key.split('/')
    course_folder = path_parts[1]
    thumb_key = f"thumbnails/{course_folder}/{thumb_filename}"

    try:
        s3.download_file(bucket, key, video_path)
        ffmpeg_cmd = f"/opt/bin/ffmpeg -i {shlex.quote(video_path)} -ss 00:00:01 -vframes 1 -q:v 2 {shlex.quote(thumb_path)} -y"
        subprocess.check_call(shlex.split(ffmpeg_cmd))
        s3.upload_file(thumb_path, bucket, thumb_key, ExtraArgs={'ContentType': 'image/jpeg'})
        return {'status': 'success', 'thumbnail': thumb_key}
    except Exception as e:
        print(f"Extraction failed: {str(e)}")
        return {'status': 'error', 'message': str(e)}
    finally:
        if os.path.exists(video_path): os.remove(video_path)
        if os.path.exists(thumb_path): os.remove(thumb_path)
EOF
}

# Zip packaging
data "archive_file" "start_transcribe_zip" {
  type        = "zip"
  source_file = local_file.start_transcribe_py.filename
  output_path = "${path.module}/start_transcribe.zip"
  depends_on  = [local_file.start_transcribe_py]
}

data "archive_file" "postprocess_zip" {
  type        = "zip"
  source_file = local_file.postprocess_py.filename
  output_path = "${path.module}/postprocess_subtitles.zip"
  depends_on  = [local_file.postprocess_py]
}

data "archive_file" "add_video_to_db_zip" {
  type        = "zip"
  source_file = local_file.add_video_to_db_py.filename
  output_path = "${path.module}/add_video_to_db.zip"
  depends_on  = [local_file.add_video_to_db_py]
}

data "archive_file" "extract_thumbnail_zip" {
  type        = "zip"
  source_file = local_file.extract_thumbnail_py.filename
  output_path = "${path.module}/extract_thumbnail.zip"
  depends_on  = [local_file.extract_thumbnail_py]
}

# SNS Topic for Fan-Out
resource "aws_sns_topic" "video_updates" {
  name = "${var.app_name}-video-updates"
}

resource "aws_sns_topic_policy" "default" {
  arn = aws_sns_topic.video_updates.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.video_updates.arn
        Condition = {
          ArnLike = { "aws:SourceArn" : var.s3_bucket_arn }
        }
      }
    ]
  })
}

# IAM Role
resource "aws_iam_role" "lambda_role" {
  count = var.create_role ? 1 : 0
  name  = "${var.app_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  count = var.create_role ? 1 : 0
  name  = "${var.app_name}-lambda-policy"
  role  = aws_iam_role.lambda_role[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:CopyObject"]
        Resource = "${var.s3_bucket_arn}/*"
      }
    ]
  })
}

# Lambda Functions
resource "aws_lambda_function" "start_transcribe" {
  count            = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  filename         = data.archive_file.start_transcribe_zip.output_path
  function_name    = "${var.app_name}-start-transcribe"
  role             = var.create_role ? aws_iam_role.lambda_role[0].arn : var.existing_role_arn
  handler          = "start_transcribe.lambda_handler"
  runtime          = "python3.9"
  source_code_hash = data.archive_file.start_transcribe_zip.output_base64sha256
}

resource "aws_lambda_function" "postprocess_subtitles" {
  count            = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  filename         = data.archive_file.postprocess_zip.output_path
  function_name    = "${var.app_name}-postprocess-subtitles"
  role             = var.create_role ? aws_iam_role.lambda_role[0].arn : var.existing_role_arn
  handler          = "postprocess_subtitles.lambda_handler"
  runtime          = "python3.9"
  source_code_hash = data.archive_file.postprocess_zip.output_base64sha256
}

resource "aws_lambda_function" "add_video_to_db" {
  count            = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  filename         = data.archive_file.add_video_to_db_zip.output_path
  function_name    = "${var.app_name}-add-video-to-db"
  role             = var.create_role ? aws_iam_role.lambda_role[0].arn : var.existing_role_arn
  handler          = "add_video_to_db.lambda_handler"
  runtime          = "python3.9"
  source_code_hash = data.archive_file.add_video_to_db_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE = var.dynamodb_table_name
    }
  }
}

resource "aws_lambda_function" "extract_thumbnail" {
  count            = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  filename         = data.archive_file.extract_thumbnail_zip.output_path
  function_name    = "${var.app_name}-extract-thumbnail"
  role             = var.create_role ? aws_iam_role.lambda_role[0].arn : var.existing_role_arn
  handler          = "extract_thumbnail.lambda_handler"
  runtime          = "python3.9"
  source_code_hash = data.archive_file.extract_thumbnail_zip.output_base64sha256
  timeout          = 30
  memory_size      = 512

  # Public FFmpeg Layer for us-east-1
  layers = ["arn:aws:lambda:us-east-1:145266761615:layer:ffmpeg:1"]

  environment {
    variables = {
      DYNAMODB_TABLE = var.dynamodb_table_name
    }
  }
}

# [NEW] Node.js Lambda for Transcribe Completion (Phase 9)
resource "aws_lambda_function" "on_transcribe_complete" {
  function_name    = "${var.app_name}-on-transcribe-complete"
  role             = var.create_role ? aws_iam_role.lambda_role[0].arn : var.existing_role_arn
  handler          = "onTranscribeComplete.handler"
  runtime          = "nodejs18.x"
  filename         = "${path.module}/on_transcribe_complete.zip" # Packaged by CD or manual zip
  
  environment {
    variables = {
      DYNAMODB_TABLE = var.dynamodb_table_name
      S3_BUCKET_NAME = var.s3_bucket_name
    }
  }
}

# [NEW] EventBridge Rule for Transcribe (Phase 9)
resource "aws_cloudwatch_event_rule" "transcribe_state_change" {
  name        = "${var.app_name}-transcribe-state-change"
  description = "Triggered when AWS Transcribe job finishes"
  event_pattern = jsonencode({
    source      = ["aws.transcribe"]
    detail-type = ["Transcribe Job State Change"]
    detail = {
      TranscriptionJobStatus = ["COMPLETED", "FAILED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "trigger_lambda" {
  rule      = aws_cloudwatch_event_rule.transcribe_state_change.name
  target_id = "SendToLambda"
  arn       = aws_lambda_function.on_transcribe_complete.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.on_transcribe_complete.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.transcribe_state_change.arn
}

# SNS Subscriptions
resource "aws_sns_topic_subscription" "start_transcribe" {
  count     = length(aws_lambda_function.start_transcribe)
  topic_arn = aws_sns_topic.video_updates.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.start_transcribe[0].arn
}

resource "aws_sns_topic_subscription" "add_video" {
  count     = length(aws_lambda_function.add_video_to_db)
  topic_arn = aws_sns_topic.video_updates.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.add_video_to_db[0].arn
}

resource "aws_sns_topic_subscription" "extract_thumbnail" {
  count     = length(aws_lambda_function.extract_thumbnail)
  topic_arn = aws_sns_topic.video_updates.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.extract_thumbnail[0].arn
}

# Permissions
resource "aws_lambda_permission" "sns_start_transcribe" {
  count         = length(aws_lambda_function.start_transcribe)
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.start_transcribe[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.video_updates.arn
}

resource "aws_lambda_permission" "sns_add_video" {
  count         = length(aws_lambda_function.add_video_to_db)
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.add_video_to_db[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.video_updates.arn
}

resource "aws_lambda_permission" "sns_extract_thumbnail" {
  count         = length(aws_lambda_function.extract_thumbnail)
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.extract_thumbnail[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.video_updates.arn
}

# S3 Notification
resource "aws_s3_bucket_notification" "video_upload" {
  bucket = var.s3_bucket_name

  topic {
    topic_arn     = aws_sns_topic.video_updates.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "videos/"
    filter_suffix = ".mp4"
  }

  depends_on = [aws_sns_topic_policy.default]
}
