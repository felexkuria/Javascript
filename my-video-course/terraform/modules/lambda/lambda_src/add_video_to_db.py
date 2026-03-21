import json, os, urllib.parse, boto3, re

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    """
    IMPORTANT: This Lambda is triggered via an SNS Topic (Fan-Out pattern).
    The S3 event is wrapped inside the SNS message. Do not revert to direct S3 parsing
    unless you also revert the Terraform SNS configuration.
    """
    print("Event received from SNS:", json.dumps(event))
    try:
        # SNS sends the S3 event inside a 'Message' field
        sns_message = event['Records'][0]['Sns']['Message']
        s3_event = json.loads(sns_message)
        rec = s3_event['Records'][0]['s3']
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except Exception as e:
        print(f"Error parsing SNS/S3 data: {str(e)}")
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
