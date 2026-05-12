import json, os, urllib.parse, boto3

s3 = boto3.client('s3')

def lambda_handler(event, context):
    for rec in event.get('Records', []):
        try:
            bucket = rec['s3']['bucket']['name']
            key = urllib.parse.unquote_plus(rec['s3']['object']['key'])
        except Exception:
            continue
        
        if not (key.endswith('.vtt') or key.endswith('.srt')):
            continue
        
        folder = os.path.dirname(key)
        filename = os.path.basename(key)
        
        if '__' not in filename:
            continue
        
        base_with_ts, ext = os.path.splitext(filename)
        original_base = base_with_ts.split('__', 1)[0]
        desired_key = f"{folder}/{original_base}{ext}"
        
        s3.copy_object(
            Bucket=bucket,
            CopySource={'Bucket': bucket, 'Key': key},
            Key=desired_key
        )
