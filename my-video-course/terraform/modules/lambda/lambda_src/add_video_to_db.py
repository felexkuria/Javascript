import json, os, urllib.parse, boto3, re
from datetime import datetime

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    try:
        # Detect and Unwrap SNS Envelope if mediated by SNS
        record = event['Records'][0]
        if 'Sns' in record:
            s3_event = json.loads(record['Sns']['Message'])
            rec = s3_event['Records'][0]['s3']
        else:
            # Direct S3 Trigger
            rec = record['s3']
            
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except (KeyError, IndexError, json.JSONDecodeError, TypeError) as e:
        print(f"Ingestion Ignored: {str(e)}")
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
    
    video_data = {
        'courseName': course_name,
        'videoId': f"{course_name}_{title}_{int(context.aws_request_id.replace('-', '')[:8], 16)}",
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
