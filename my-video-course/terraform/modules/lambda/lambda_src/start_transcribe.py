import json, os, time, urllib.parse, boto3

transcribe = boto3.client('transcribe')

def lambda_handler(event, context):
    try:
        rec = event['Records'][0]['s3']
        bucket = rec['bucket']['name']
        key = urllib.parse.unquote_plus(rec['object']['key'])
    except Exception as e:
        return {'status': 'ignored'}
    
    if not (key.startswith("videos/dev-ops-bootcamp_202201/") or key.startswith("videos/AWS CLOUD SOLUTIONS ARCHITECT/")):
        return {'status': 'skipped'}
    
    if not key.lower().endswith(('.mp4', '.mov', '.mkv', '.avi', '.wav', '.mp3')):
        return {'status': 'skipped'}
    
    base = os.path.splitext(os.path.basename(key))[0]
    job_name = f"{base}__{int(time.time())}"
    media_format = key.split('.')[-1].lower()
    media_uri = f"s3://{bucket}/{key}"
    output_prefix = os.path.dirname(key) + '/'
    
    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': media_uri},
        MediaFormat=media_format,
        LanguageCode=os.environ.get('LANGUAGE_CODE', 'en-US'),
        OutputBucketName=bucket,
        OutputKey=output_prefix,
        Subtitles={'Formats': ['vtt', 'srt'], 'OutputStartIndex': 1}
    )
    return {'status': 'started', 'job': job_name}
