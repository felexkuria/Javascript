# Lambda function source code and packaging

# Create Lambda source files
resource "local_file" "start_transcribe_py" {
  filename = "${path.module}/lambda_src/start_transcribe.py"
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
        return {'status': 'ignored'}
    
    # Filter for target folder & media suffixes
    if not key.startswith("videos/dev-ops-bootcamp_202201/"):
        print("Skipping non-target folder:", key)
        return {'status': 'skipped'}
    
    if not key.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.wav', '.mp3')):
        print("Skipping non-media:", key)
        return {'status': 'skipped'}
    
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
            Subtitles={'Formats': ['vtt', 'srt'], 'OutputStartIndex': 1}
        )
        print("Transcribe started:", job_name)
        return {'status': 'started', 'job': job_name}
    except Exception as e:
        print("Error starting transcription:", e)
        raise
EOF
}

resource "local_file" "postprocess_py" {
  filename = "${path.module}/lambda_src/postprocess_subtitles.py"
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
        original_base = base_with_ts.split('__', 1)[0]
        desired_key = f"{folder}/{original_base}{ext}"
        
        print("Copying", key, "to", desired_key)
        
        try:
            s3.copy_object(
                Bucket=bucket,
                CopySource={'Bucket': bucket, 'Key': key},
                Key=desired_key
            )
            print("Copied subtitle to", desired_key)
        except Exception as e:
            print("Error copying:", e)
EOF
}

# Create ZIP files for Lambda functions
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