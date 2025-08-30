import json, os, time, urllib.parse, boto3

transcribe = boto3.client('transcribe')

def lambda_handler(event, context):
    print("Event:", json.dumps(event))
    
    try:
        rec = event['Records'][0]['s3']
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except Exception as e:
        print("Not an S3 put event or missing data:", e)
        return {'status': 'ignored'}
    
    # Filter for target folder & media suffixes
    if not key.startswith("videos/dev-ops-bootcamp_202201/"):
        print("Skipping non-target folder:", key)
        return {'status': 'skipped'}
    
    if not key.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.wav', '.mp3')):
        print("Skipping non-media:", key)
        return {'status': 'skipped'}
    
    base = os.path.splitext(os.path.basename(key))[0]
    job_name = f"{base}__{int(time.time())}"
    media_format = key.split('.')[-1].lower()
    media_uri = f"s3://{bucket}/{key}"
    output_prefix = os.path.dirname(key) + '/'
    
    print("Starting Transcribe job:", job_name, media_uri)
    
    try:
        transcribe.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={'MediaFileUri': media_uri},
            MediaFormat=media_format,
            LanguageCode=os.environ.get('LANGUAGE_CODE', 'en-US'),
            OutputBucketName=bucket,
            OutputKey=output_prefix,
            Subtitles={'Formats': ['vtt', 'srt'], 'OutputStartIndex': 1}
        )
        print("Transcribe started:", job_name)
        return {'status': 'started', 'job': job_name}
    except Exception as e:
        print("Error starting transcription:", e)
        raise
