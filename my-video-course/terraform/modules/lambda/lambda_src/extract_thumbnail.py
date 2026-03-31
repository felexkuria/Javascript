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
        if not table_name:
            # Fallback to dev/prod based on bucket name or prefix
            table_name = "video-course-app-videos-prod" if "prod" in bucket else "video-course-app-videos-dev"
            
        table = dynamodb.Table(table_name)
        # Find the video record by s3Key
        response = table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('s3Key').eq(key)
        )
        
        if response['Items']:
            for item in response['Items']:
                video_id = item['videoId']
                # Construct full S3 URL for thumbnail
                thumbnail_url = f"https://{bucket}.s3.amazonaws.com/{thumb_key}"
                
                table.update_item(
                    Key={
                        'courseName': item['courseName'],
                        'videoId': video_id
                    },
                    UpdateExpression="set thumbnailUrl = :t, #s = :online",
                    ExpressionAttributeNames={ "#s": "status" },
                    ExpressionAttributeValues={
                        ':t': thumbnail_url,
                        ':online': 'ONLINE'
                    }
                )
                print(f"Updated DynamoDB for {video_id} with thumbnail.")
        else:
            print(f"No DynamoDB record found for s3Key: {key}")
            
        return {'status': 'success', 'thumbnail': thumb_key}
    except Exception as e:
        print(f"Extraction failed: {str(e)}")
        return {'status': 'error', 'message': str(e)}
    finally:
        # Cleanup
        if os.path.exists(video_path): os.remove(video_path)
        if os.path.exists(thumb_path): os.remove(thumb_path)
