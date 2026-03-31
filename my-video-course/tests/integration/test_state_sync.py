import os
import sys
import pytest
import boto3
from botocore.exceptions import ClientError

# Add the lambda_src directory to sys.path to allow importing cleanup_sync
lambda_src_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../terraform/modules/lambda/lambda_src"))
sys.path.append(lambda_src_path)

import cleanup_sync

@pytest.fixture
def setup_sync_env(s3_bucket, videos_table_name, monkeypatch):
    """Set up environment variables required by the cleanup_sync module."""
    monkeypatch.setenv("S3_BUCKET_NAME", s3_bucket)
    monkeypatch.setenv("DYNAMODB_TABLE", videos_table_name)

def test_sync_case_a_orphaned_record(
    dynamodb_resource, videos_table_name, s3_bucket, qa_prefix, setup_sync_env, dynamo_cleanup_keys
):
    """
    Test Case A: Orphaned Database Record.
    Record exists in DynamoDB but the S3 key is missing.
    Pass Criteria: Record is automatically purged.
    """
    table = dynamodb_resource.Table(videos_table_name)
    course_name = f"{qa_prefix}-course-a"
    video_id = f"{qa_prefix}-vid-orphaned"
    s3_key = f"videos/{course_name}/missing-file.mp4"
    
    item = {
        "courseName": course_name,
        "videoId": video_id,
        "title": "Orphaned Test Video",
        "s3Key": s3_key,
        "status": "READY"
    }
    table.put_item(Item=item)
    # We don't add to dynamo_cleanup_keys because we expect it to be deleted
    
    print(f"Inserted orphaned record: {video_id}")
    
    # Trigger Proactive Audit (handle_proactive_audit)
    # Note: handle_proactive_audit eventually calls handle_ghost_file_check
    result = cleanup_sync.handle_proactive_audit()
    
    # Assertions
    response = table.get_item(Key={"courseName": course_name, "videoId": video_id})
    assert "Item" not in response, f"Orphaned record {video_id} was not purged by sync job."
    print(f"✅ Case A Passed: Orphaned record purged.")

def test_sync_case_b_ghost_file(
    s3_client, dynamodb_resource, videos_table_name, s3_bucket, qa_prefix, setup_sync_env, s3_cleanup_keys
):
    """
    Test Case B: Ghost File.
    File exists in S3 but no metadata record exists in DynamoDB.
    Pass Criteria: File is moved to quarantine/ prefix.
    """
    ghost_key = f"videos/{qa_prefix}-course-b/ghost-video.mp4"
    quarantine_key = f"quarantine/{qa_prefix}-course-b/ghost-video.mp4"
    
    # Upload ghost file
    s3_client.put_object(Bucket=s3_bucket, Key=ghost_key, Body=b"fake video content")
    s3_cleanup_keys.append(ghost_key)
    s3_cleanup_keys.append(quarantine_key) # Track both for cleanup
    
    print(f"Uploaded ghost file: {ghost_key}")
    
    # Ensure NO record exists in DynamoDB for this key
    table = dynamodb_resource.Table(videos_table_name)
    response = table.query(
        IndexName='s3Key-index',
        KeyConditionExpression=boto3.dynamodb.conditions.Key('s3Key').eq(ghost_key)
    )
    assert response['Count'] == 0, "Pre-condition failed: Record already exists for ghost key."
    
    # Trigger Ghost File Check
    result = cleanup_sync.handle_ghost_file_check(videos_table_name)
    
    # Assertions
    # 1. Original file should be GONE
    try:
        s3_client.head_object(Bucket=s3_bucket, Key=ghost_key)
        pytest.fail(f"Ghost file {ghost_key} still exists in original location.")
    except ClientError as e:
        assert e.response['Error']['Code'] == "404"
        
    # 2. File should be in QUARANTINE
    s3_client.head_object(Bucket=s3_bucket, Key=quarantine_key)
    print(f"✅ Case B Passed: Ghost file moved to {quarantine_key}.")
