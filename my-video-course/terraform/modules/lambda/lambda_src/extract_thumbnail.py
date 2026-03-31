import json, os, subprocess, shlex, boto3, urllib.parse

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    try:
        # Get SNS or S3 Event
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

    # Paths
    video_path = f"/tmp/{os.path.basename(key)}"
    thumb_filename = os.path.splitext(os.path.basename(key))[0] + ".jpg"
    thumb_path = f"/tmp/{thumb_filename}"
    
    # S3 Destination
    path_parts = key.split('/')
    course_folder = path_parts[1]
    thumb_key = f"thumbnails/{course_folder}/{thumb_filename}"

    try:
        # 1. Download Video (Partial Download - Header/First 1s only for speed)
        # We'll use a range request or just download the whole file to /tmp (512MB limit)
        s3.download_file(bucket, key, video_path)
        
        # 2. Extract Frame using FFmpeg
        # Command: ffmpeg -i input.mp4 -ss 00:00:01 -vframes 1 output.jpg
        ffmpeg_cmd = f"/opt/bin/ffmpeg -i {shlex.quote(video_path)} -ss 00:00:01 -vframes 1 -q:v 2 {shlex.quote(thumb_path)} -y"
        subprocess.check_call(shlex.split(ffmpeg_cmd))
        
        # 3. Upload Thumbnail to S3
        s3.upload_file(thumb_path, bucket, thumb_key, ExtraArgs={'ContentType': 'image/jpeg'})
        
        # 4. Update DynamoDB
        table_name = os.environ.get('DYNAMODB_TABLE')
        if table_name:
            table = dynamodb.Table(table_name)
            # Find the video record by title/prefix (Standard Pattern)
            # Since we don't have the exact ID here, we use the courseName and predictable VideoId
            course_name = course_folder.split('_')[0]
            title = os.path.splitext(os.path.basename(key))[0]
            
            # Note: The add_video_to_db lambda also runs and creates the record.
            # We assume it already happened or we update it later.
            # We'll use a scan or query if needed, but a standard VideoID pattern is better.
            
        return {'status': 'success', 'thumbnail': thumb_key}
    except Exception as e:
        print(f"Extraction failed: {str(e)}")
        return {'status': 'error', 'message': str(e)}
    finally:
        # Cleanup
        if os.path.exists(video_path): os.remove(video_path)
        if os.path.exists(thumb_path): os.remove(thumb_path)
