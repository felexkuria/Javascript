import json, os, urllib.parse, boto3

s3 = boto3.client('s3')

def lambda_handler(event, context):
    print("Event:", json.dumps(event))
    
    for rec in event.get('Records', []):
        try:
            bucket = rec['s3']['bucket']['name']
            key = urllib.parse.unquote_plus(rec['s3']['object']['key'])
        except Exception as e:
            print("Skipping record: not an S3 event", e)
            continue
        
        if not (key.endswith('.vtt') or key.endswith('.srt')):
            print("Not a subtitle file; skipping:", key)
            continue
        
        folder = os.path.dirname(key)
        filename = os.path.basename(key)
        
        if '__' not in filename:
            print("No job-timestamp in file; skipping:", filename)
            continue
        
        base_with_ts, ext = os.path.splitext(filename)
        original_base = base_with_ts.split('__', 1)[0]
        desired_key = f"{folder}/{original_base}{ext}"
        
        print("Copying", key, "to", desired_key)
        
        try:
            s3.copy_object(
                Bucket=bucket,
                CopySource={'Bucket': bucket, 'Key': key},
                Key=desired_key
            )
            print("Copied subtitle to", desired_key)
        except Exception as e:
            print("Error copying:", e)
