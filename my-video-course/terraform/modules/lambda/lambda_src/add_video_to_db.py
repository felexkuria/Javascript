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
