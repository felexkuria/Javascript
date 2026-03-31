import json, os, urllib.parse, boto3
from botocore.exceptions import ClientError

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    """
    Pillar 5: Data Integrity & Stale Reference Cleanup.
    Handles both Reactive (S3 ObjectRemoved) and Proactive (Cron Audit) flows.
    """
    
    # 1. Reactive Cleanup: Object was deleted from S3
    if 'Records' in event and event['Records'][0].get('eventName', '').startswith('ObjectRemoved'):
        return handle_reactive_delete(event)
    
    # 2. Proactive Audit: Scheduled Cron Job
    elif event.get('detail-type') == 'Scheduled Event' or event.get('action') == 'audit':
        return handle_proactive_audit()
        
    return {'status': 'ignored', 'reason': 'Unknown event source'}

def handle_reactive_delete(event):
    table_name = os.environ['DYNAMODB_TABLE']
    table = dynamodb.Table(table_name)
    
    for record in event['Records']:
        bucket = record['s3']['bucket']['name']
        key = urllib.parse.unquote_plus(record['s3']['object']['key'])
        
        print(f"[REACTIVE] Object deleted: s3://{bucket}/{key}. Purging from DynamoDB...")
        
        # Find the record using GSI
        response = table.query(
            IndexName='s3Key-index',
            KeyConditionExpression=boto3.dynamodb.conditions.Key('s3Key').eq(key)
        )
        
        for item in response.get('Items', []):
            table.delete_item(
                Key={'courseName': item['courseName'], 'videoId': item['videoId']}
            )
            print(f"[REACTIVE] Purged record: {item['videoId']}")
            
    return {'status': 'success', 'mode': 'reactive'}

def handle_proactive_audit():
    table_name = os.environ['DYNAMODB_TABLE']
    table = dynamodb.Table(table_name)
    
    print(f"[PROACTIVE] Starting data integrity audit for table: {table_name}")
    
    # Scan table (Weekly cron, so scan is acceptable for medium data volumes)
    # For massive scale, we would use a Distributed Map in Step Functions.
    scan_kwargs = {}
    total_checked = 0
    total_purged = 0
    
    while True:
        response = table.scan(**scan_kwargs)
        for item in response.get('Items', []):
            total_checked += 1
            s3_key = item.get('s3Key')
            if not s3_key:
                continue
                
            # Check if object exists in S3
            bucket = s3_key.split('/')[0] if '/' in s3_key else os.environ.get('S3_BUCKET_NAME')
            # Extract bucket if it's encoded in the key or use default env
            # (In this app, we know the bucket from environment)
            bucket = os.environ['S3_BUCKET_NAME']
            
            try:
                s3.head_object(Bucket=bucket, Key=s3_key)
            except ClientError as e:
                if e.response['Error']['Code'] == "404":
                    print(f"[PROACTIVE] Stale reference found: {item['videoId']} (Missing S3 key: {s3_key}). Purging...")
                    table.delete_item(Key={'courseName': item['courseName'], 'videoId': item['videoId']})
                    total_purged += 1
                else:
                    print(f"[ERROR] S3 HeadObject failed for {s3_key}: {e}")
        
        if 'LastEvaluatedKey' not in response:
            break
        scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
        
    print(f"[PROACTIVE] Audit complete. Checked: {total_checked}, Purged: {total_purged}")
    
    # 3. New Sync Logic: Audit S3 for Ghost Files (S3 has it, DB does not)
    return handle_ghost_file_check(table_name)

def handle_ghost_file_check(table_name):
    bucket = os.environ['S3_BUCKET_NAME']
    table = dynamodb.Table(table_name)
    quarantine_prefix = "quarantine/"
    
    print(f"[PROACTIVE] Starting Ghost File audit for bucket: {bucket}")
    ghost_files_moved = 0
    
    paginator = s3.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=bucket, Prefix="videos/"):
        for obj in page.get('Contents', []):
            key = obj['Key']
            # We only audit videos/, not thumbnails or other assets for now
            if not key.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.webm')):
                continue
                
            # Check if this key exists in DynamoDB using the GSI
            response = table.query(
                IndexName='s3Key-index',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('s3Key').eq(key)
            )
            
            if response['Count'] == 0:
                print(f"[PROACTIVE] Ghost File detected: {key}. Moving to quarantine...")
                new_key = key.replace("videos/", quarantine_prefix)
                
                try:
                    # Move = Copy + Delete
                    s3.copy_object(
                        Bucket=bucket,
                        CopySource={'Bucket': bucket, 'Key': key},
                        Key=new_key
                    )
                    s3.delete_object(Bucket=bucket, Key=key)
                    ghost_files_moved += 1
                    print(f"[PROACTIVE] Successfully quarantined: {key} -> {new_key}")
                except Exception as e:
                    print(f"[ERROR] Failed to quarantine {key}: {e}")
                    
    return {'status': 'success', 'mode': 'proactive', 'ghost_files_quarantined': ghost_files_moved}
