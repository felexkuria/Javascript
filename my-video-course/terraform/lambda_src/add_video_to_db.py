import json, os, urllib.parse, boto3, re

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    print("Event:", json.dumps(event))
    
    try:
        rec = event['Records'][0]['s3']
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except Exception as e:
        print("Not an S3 put event:", e)
        return {'status': 'ignored'}
    
    # Only process video files in videos/ folder
    if not key.startswith("videos/") or not key.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.webm', '.flv', '.wmv')):
        print("Skipping non-video:", key)
        return {'status': 'skipped'}
    
    # Extract course name and video info
    path_parts = key.split('/')
    if len(path_parts) < 3:
        print("Invalid path structure:", key)
        return {'status': 'invalid_path'}
    
    course_folder = path_parts[1]  # e.g., "dev-ops-bootcamp_202201"
    course_name = course_folder.split('_')[0]  # e.g., "dev-ops-bootcamp"
    filename = os.path.basename(key)
    title = os.path.splitext(filename)[0]
    
    # Extract lesson number for ordering
    lesson_match = re.search(r'lesson(\d+)', title.lower())
    order = int(lesson_match.group(1)) if lesson_match else 0
    
    # Prepare video data
    video_data = {
        'courseName': course_name,
        'videoId': f"{course_name}_{title}_{int(context.aws_request_id.replace('-', '')[:8], 16)}",
        '_id': f"{course_name}_{title}_{int(context.aws_request_id.replace('-', '')[:8], 16)}",
        'title': title.replace('_', ' ').title(),
        'description': f"Video: {filename}",
        'videoUrl': key,
        'order': order,
        'watched': False,
        'watchedAt': None,
        'createdAt': context.aws_request_id,
        'updatedAt': context.aws_request_id
    }
    
    # Add to DynamoDB
    env = os.environ.get('NODE_ENV', 'dev')
    table_name = f"video-course-app-videos-{env}"
    
    try:
        table = dynamodb.Table(table_name)
        table.put_item(Item=video_data)
        print(f"Added video to DynamoDB: {title}")
        return {'status': 'success', 'video': title}
    except Exception as e:
        print(f"Error adding to DynamoDB: {e}")
        return {'status': 'error', 'error': str(e)}
