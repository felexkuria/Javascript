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
        
        # SOTERA Industry Standard: Using community layer path
        ffmpeg_bin = "/opt/bin/ffmpeg"
        ffmpeg_cmd = f"{ffmpeg_bin} -i {shlex.quote(video_path)} -ss 00:00:01 -vframes 1 -q:v 2 {shlex.quote(thumb_path)} -y > /tmp/ffmpeg_out.txt 2>&1"
        print(f"Running: {ffmpeg_cmd}")
        
        exit_code = os.system(ffmpeg_cmd)
        
        with open('/tmp/ffmpeg_out.txt', 'r') as f:
            ffmpeg_log = f.read()
            print(f"FFmpeg Output:\n{ffmpeg_log}")
        
        if exit_code != 0:
            return {'status': 'error', 'message': f"FFmpeg exit {exit_code}. Log: {ffmpeg_log[:200]}"}

        s3.upload_file(thumb_path, bucket, thumb_key, ExtraArgs={'ContentType': 'image/jpeg'})
        
        # [NEW] Update DynamoDB Handshake (SOTA Schema)
        table_name = os.environ.get('DYNAMODB_TABLE')
        if not table_name:
            table_name = "video-course-app-videos-prod" if "prod" in bucket else "video-course-app-videos-dev"
            
        table = dynamodb.Table(table_name)
        response = table.scan(FilterExpression=boto3.dynamodb.conditions.Attr('s3Key').eq(key))
        
        if response['Items']:
            for item in response['Items']:
                video_id = item['videoId']
                course_name = item['courseName']
                thumbnail_url = f"https://{bucket}.s3.amazonaws.com/{thumb_key}"
                
                table.update_item(
                    Key={'courseName': course_name, 'videoId': video_id},
                    UpdateExpression="set thumbnailUrl = :t, #s = :online",
                    ExpressionAttributeNames={ "#s": "status" },
                    ExpressionAttributeValues={':t': thumbnail_url, ':online': 'ONLINE'}
                )
        
        return {'status': 'success', 'thumbnail': thumb_key}
    except Exception as e:
        print(f"Extraction failed: {str(e)}")
        return {'status': 'error', 'message': str(e)}
    finally:
        if os.path.exists(video_path): os.remove(video_path)
        if os.path.exists(thumb_path): os.remove(thumb_path)
