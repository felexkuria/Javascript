import json, os, subprocess, boto3, urllib.parse

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def _parse_record(record):
    """Unwrap either a raw S3 record or an SNS-envelope S3 record."""
    if 'Sns' in record:
        s3_rec = json.loads(record['Sns']['Message'])['Records'][0]['s3']
    else:
        s3_rec = record['s3']
    bucket = s3_rec['bucket']['name']
    key    = urllib.parse.unquote_plus(s3_rec['object']['key'])
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

    # ⚠️ PERFORMANCE TODO (Junior Task):
    # Replace this full-table scan with a GSI query once you have created
    # a Global Secondary Index with s3Key as the Partition Key.
    # Example:
    #   response = table.query(
    #       IndexName='s3Key-index',
    #       KeyConditionExpression=boto3.dynamodb.conditions.Key('s3Key').eq(key)
    #   )
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('s3Key').eq(key)
    )

    thumbnail_url = f"https://{bucket}.s3.amazonaws.com/{thumb_key}"
    for item in response.get('Items', []):
        table.update_item(
            Key={'courseName': item['courseName'], 'videoId': item['videoId']},
            UpdateExpression="set thumbnailUrl = :t, #s = :online",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={':t': thumbnail_url, ':online': 'ONLINE'}
        )
