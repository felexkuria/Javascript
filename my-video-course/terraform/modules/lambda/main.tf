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
  content    = <<EOF
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
  content    = <<EOF
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
  content    = <<EOF
import json, os, urllib.parse, boto3, re, hashlib
from datetime import datetime

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    if 'detail' in event: # EventBridge / Step Function Format
        bucket = event['detail']['bucket']['name']
        key = urllib.parse.unquote_plus(event['detail']['object']['key'])
    elif 'Records' in event: # Legacy S3 / SNS Format
        rec = event['Records'][0]['s3']
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    else:
        return {'status': 'ignored'}
    
    if not key.startswith("videos/") or not key.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.webm')):
        return {'status': 'skipped'}
    
    path_parts = key.split('/')
    course_folder = path_parts[1]
    course_name = course_folder.split('_')[0]
    filename = os.path.basename(key)
    title = os.path.splitext(filename)[0]
    
    # NEW (Universal SOTA): Standardized Thumbnail Linking
    thumb_path = f"thumbnails/{course_folder}/{title}.jpg"
    thumbnail_url = f"https://{bucket}.s3.amazonaws.com/{thumb_path}"
    
    # [IDEMPOTENCY FIX]: Deterministic VideoID based on S3 Key
    video_id_seed = f"{course_name}_{key}"
    video_id_hash = hashlib.sha256(video_id_seed.encode()).hexdigest()[:12]
    video_id = f"{course_name}_{title.replace(' ', '_')}_{video_id_hash}"
    
    video_data = {
        'courseName': course_name,
        'videoId': video_id,
        'title': title.replace('_', ' ').title(),
        'videoUrl': f"https://{bucket}.s3.amazonaws.com/{key}",
        'thumbnailUrl': thumbnail_url,
        's3Key': key,
        'watched': False,
        'createdAt': datetime.utcnow().isoformat() + 'Z'
    }
    
    table_name = os.environ.get('DYNAMODB_TABLE')
    if not table_name:
        table_name = f"video-course-app-videos-prod" # Fallback
        
    table = dynamodb.Table(table_name)
    table.put_item(Item=video_data)
    return {'status': 'success'}
EOF
}

resource "local_file" "extract_thumbnail_py" {
  filename   = "${path.module}/lambda_src/extract_thumbnail.py"
  depends_on = [null_resource.lambda_src_dir]
  content    = <<EOF
import json, os, subprocess, boto3, urllib.parse

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def _parse_record(record):
    """Unwrap either a raw S3 record or an SNS-envelope S3 record."""
    if 'detail' in record: # EventBridge / Step Function Format
        bucket = record['detail']['bucket']['name']
        key    = urllib.parse.unquote_plus(record['detail']['object']['key'])
    elif 'Sns' in record: # Legacy SNS Format
        s3_rec = json.loads(record['Sns']['Message'])['Records'][0]['s3']
        bucket = s3_rec['bucket']['name']
        key    = urllib.parse.unquote_plus(s3_rec['object']['key'])
    elif 's3' in record: # Legacy Raw S3 Format
        bucket = record['s3']['bucket']['name']
        key    = urllib.parse.unquote_plus(record['s3']['object']['key'])
    else:
        raise ValueError("Unknown record format")
    return bucket, key

def lambda_handler(event, context):
    # Batch loop: S3/SNS can deliver multiple records in one invocation.
    for record in event.get('Records', []):
        try:
            bucket, key = _parse_record(record)
        except Exception as e:
            print(f"[SKIP] Could not parse record: {e}")
            continue

        if not key.startswith("videos/") or not key.lower().endswith(('.mp4', '.mov', '.mkv')):
            print(f"[SKIP] Non-video key ignored: {key}")
            continue

        _process(bucket, key)

def _process(bucket, key):
    thumb_filename = os.path.splitext(os.path.basename(key))[0] + ".jpg"
    thumb_path     = f"/tmp/{thumb_filename}"
    course_folder  = key.split('/')[1]
    thumb_key      = f"thumbnails/{course_folder}/{thumb_filename}"

    # --- STREAMING: generate a pre-signed URL so FFmpeg reads only the bytes
    # it needs (the first keyframe), instead of downloading the entire file
    # into /tmp/ (which is limited to 512 MB and increases cold-start time).
    presigned_url = s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=300  # URL valid for 5 minutes
    )
    print(f"[INFO] Streaming thumbnail from presigned URL for: {key}")

    try:
        # subprocess.run with check=True raises CalledProcessError on failure.
        # capture_output=True keeps stdout/stderr in memory — no temp files.
        result = subprocess.run(
            [
                "/opt/bin/ffmpeg",
                "-i", presigned_url,   # read directly from S3 — no /tmp/ download
                "-ss", "00:00:01",
                "-vframes", "1",
                "-q:v", "2",
                thumb_path,
                "-y"
            ],
            capture_output=True,
            check=True  # raises subprocess.CalledProcessError on non-zero exit
        )
        print(result.stdout.decode(errors='replace')[-2000:])  # last 2 KB
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] FFmpeg failed:\n{e.stderr.decode(errors='replace')[-2000:]}")
        # Re-raise so Lambda marks this as a FAILURE (enables DLQ / retry).
        raise

    s3.upload_file(thumb_path, bucket, thumb_key, ExtraArgs={'ContentType': 'image/jpeg'})
    print(f"[INFO] Thumbnail uploaded to: {thumb_key}")

    # cleanup
    if os.path.exists(thumb_path):
        os.remove(thumb_path)

    # --- DynamoDB update --------------------------------------------------
    table_name = os.environ.get('DYNAMODB_TABLE')
    if not table_name:
        table_name = "video-course-app-videos-prod" if "prod" in bucket else "video-course-app-videos-dev"

    table = dynamodb.Table(table_name)

    # Optimized (Senior Data Engineer): GSI Query via s3Key-index
    response = table.query(
        IndexName='s3Key-index',
        KeyConditionExpression=boto3.dynamodb.conditions.Key('s3Key').eq(key)
    )

    thumbnail_url = f"https://{bucket}.s3.amazonaws.com/{thumb_key}"
    for item in response.get('Items', []):
        table.update_item(
            Key={'courseName': item['courseName'], 'videoId': item['videoId']},
            UpdateExpression="set thumbnailUrl = :t, #s = :online",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={':t': thumbnail_url, ':online': 'ONLINE'}
        )
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

data "archive_file" "cleanup_sync_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_src/cleanup_sync.py"
  output_path = "${path.module}/cleanup_sync.zip"
}

# [NEW] Data source to automatically package the Node.js Transcribe completion Lambda.
# This ensures the .zip exists before terraform apply attempts to create the function.
data "archive_file" "on_transcribe_complete_zip" {
  type        = "zip"
  source_file = "${path.module}/../../../backend/src/lambdas/onTranscribeComplete.js"
  output_path = "${path.module}/on_transcribe_complete.zip"
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
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Scan", "dynamodb:Query"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:CopyObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = "*"
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

  dead_letter_config {
    target_arn = aws_sqs_queue.pipeline_dlq.arn
  }

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
  runtime          = "python3.12"
  source_code_hash = data.archive_file.extract_thumbnail_zip.output_base64sha256

  dead_letter_config {
    target_arn = aws_sqs_queue.pipeline_dlq.arn
  }
  timeout     = 60
  memory_size = 1024
  # Self-managed FFmpeg layer built from ffmpeg.zip (see ffmpeg_layer.tf).
  # Previously referenced a public 3rd-party ARN — using our own layer gives
  # full control over the binary version and avoids external dependency.
  layers = [aws_lambda_layer_version.ffmpeg.arn]

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
  filename         = data.archive_file.on_transcribe_complete_zip.output_path
  source_code_hash = data.archive_file.on_transcribe_complete_zip.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE = var.dynamodb_table_name
      S3_BUCKET_NAME = var.s3_bucket_name
    }
  }
}

# [NEW] Pillar 5: Data Integrity Lambda (Reactive/Proactive Sync)
resource "aws_lambda_function" "cleanup_sync" {
  function_name    = "${var.app_name}-cleanup-sync"
  role             = var.create_role ? aws_iam_role.lambda_role[0].arn : var.existing_role_arn
  handler          = "cleanup_sync.lambda_handler"
  runtime          = "python3.9"
  filename         = data.archive_file.cleanup_sync_zip.output_path
  source_code_hash = data.archive_file.cleanup_sync_zip.output_base64sha256
  timeout          = 300 # Proactive audit needs more time

  environment {
    variables = {
      DYNAMODB_TABLE = var.dynamodb_table_name
      S3_BUCKET_NAME = var.s3_bucket_name
    }
  }
}

# --- Pillar 5 Triggers ------------------------------------------------
# 1. Proactive Audit (Weekly Cron)
resource "aws_cloudwatch_event_rule" "weekly_audit" {
  name                = "${var.app_name}-weekly-audit"
  description         = "Audit DynamoDB for stale S3 references"
  schedule_expression = "cron(0 0 ? * SUN *)"
}

resource "aws_cloudwatch_event_target" "trigger_audit" {
  rule      = aws_cloudwatch_event_rule.weekly_audit.name
  target_id = "TriggerAuditLambda"
  arn       = aws_lambda_function.cleanup_sync.arn
}

resource "aws_lambda_permission" "allow_audit_eventbridge" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cleanup_sync.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_audit.arn
}

# 2. Reactive Cleanup (S3 Object Removed)
resource "aws_lambda_permission" "allow_s3_removed" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cleanup_sync.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = var.s3_bucket_arn
}

resource "aws_s3_bucket_notification" "reactive_delete" {
  bucket = var.s3_bucket_name

  // Legacy support for direct Lambda invocation on S3 object removed
  lambda_function {
    lambda_function_arn = aws_lambda_function.cleanup_sync.arn
    events              = ["s3:ObjectRemoved:*"]
  }

  // Add the ObjectCreated SNS notification if we're not fully on Step Functions yet
  topic {
    topic_arn     = aws_sns_topic.video_updates.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "videos/"
  }

  depends_on = [aws_lambda_permission.allow_s3_removed, aws_sns_topic_policy.default]
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
  count     = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  topic_arn = aws_sns_topic.video_updates.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.start_transcribe[0].arn
}

resource "aws_sns_topic_subscription" "add_video" {
  count     = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  topic_arn = aws_sns_topic.video_updates.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.add_video_to_db[0].arn
}

resource "aws_sns_topic_subscription" "extract_thumbnail" {
  count     = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  topic_arn = aws_sns_topic.video_updates.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.extract_thumbnail[0].arn
}

# Permissions
resource "aws_lambda_permission" "sns_start_transcribe" {
  count         = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.start_transcribe[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.video_updates.arn
}

resource "aws_lambda_permission" "sns_add_video" {
  count         = (var.create_role || var.existing_role_arn != null) ? 1 : 0
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.add_video_to_db[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.video_updates.arn
}

resource "aws_lambda_permission" "sns_extract_thumbnail" {
  count         = (var.create_role || var.existing_role_arn != null) ? 1 : 0
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
