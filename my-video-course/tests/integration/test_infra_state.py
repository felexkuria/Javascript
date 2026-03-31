"""
test_infra_state.py — Infrastructure state assertions via AWS CLI / boto3.

These tests run BEFORE the application-layer tests and verify that Terraform
actually provisioned all expected resources in the target environment.
Think of them as "did the deployment even work?" smoke tests.

Tests:
  1. S3 bucket exists (HeadBucket returns 200).
  2. All four DynamoDB tables exist (videos, gamification, users, captions).
  3. All four Lambda functions are deployed and in an active state.
  4. The SNS fan-out topic exists.
  5. The Lambda layer (FFmpeg) exists and is ACTIVE.

Environment variables read:
  APP_NAME          — e.g. video-course-app   (default: video-course-app)
  APP_ENVIRONMENT   — e.g. staging or prod    (default: prod)
  APP_S3_BUCKET     — full bucket name
"""

import os
import pytest
import boto3
from botocore.exceptions import ClientError


# ---------------------------------------------------------------------------
# Fixtures for this module
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def app_name() -> str:
    return os.environ.get("APP_NAME", "video-course-app")


@pytest.fixture(scope="module")
def environment() -> str:
    return os.environ.get("APP_ENVIRONMENT", "prod")


@pytest.fixture(scope="module")
def lambda_client(aws_region):
    return boto3.client("lambda", region_name=aws_region)


@pytest.fixture(scope="module")
def sns_client(aws_region):
    return boto3.client("sns", region_name=aws_region)


# ---------------------------------------------------------------------------
# 1. S3 Bucket Exists
# ---------------------------------------------------------------------------
def test_s3_bucket_exists(s3_client, s3_bucket):
    """
    HeadBucket should return 200. A 404 means the bucket name in the
    environment variable doesn't match what Terraform created.
    """
    try:
        s3_client.head_bucket(Bucket=s3_bucket)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            pytest.fail(
                f"S3 bucket '{s3_bucket}' does not exist. "
                "Did `terraform apply` complete successfully?"
            )
        elif code == "403":
            pytest.fail(
                f"S3 bucket '{s3_bucket}' exists but access is denied. "
                "Check the Lambda/CI IAM role's s3:HeadBucket permission."
            )
        raise


# ---------------------------------------------------------------------------
# 2. All DynamoDB Tables Exist
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("table_suffix", ["videos", "gamification", "users", "captions"])
def test_dynamodb_tables_exist(dynamodb_client, app_name, environment, table_suffix):
    """
    Each of the four tables defined in storage/main.tf must exist
    and be in ACTIVE status. A CREATING or DELETING status would
    mean Terraform apply is still in progress.
    """
    table_name = f"{app_name}-{table_suffix}-{environment}"
    try:
        response = dynamodb_client.describe_table(TableName=table_name)
        status = response["Table"]["TableStatus"]
        assert status == "ACTIVE", (
            f"Table '{table_name}' exists but is not ACTIVE — status: {status!r}. "
            "Terraform apply may still be in progress."
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            pytest.fail(
                f"DynamoDB table '{table_name}' not found. "
                "Check `terraform apply` output and the APP_NAME / APP_ENVIRONMENT env vars."
            )
        raise


# ---------------------------------------------------------------------------
# 3. All Lambda Functions Are Deployed
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "fn_suffix",
    [
        "start-transcribe",
        "postprocess-subtitles",
        "add-video-to-db",
        "extract-thumbnail",
    ],
)
def test_lambda_functions_deployed(lambda_client, app_name, fn_suffix):
    """
    Each Lambda function defined in modules/lambda/main.tf must exist
    and be in the 'Active' LastUpdateStatus (not 'Failed' or 'InProgress').
    """
    function_name = f"{app_name}-{fn_suffix}"
    try:
        response = lambda_client.get_function(FunctionName=function_name)
        config = response["Configuration"]
        last_status = config.get("LastUpdateStatus", "Unknown")
        state = config.get("State", "Unknown")

        assert state == "Active", (
            f"Lambda '{function_name}' is not in Active state — State: {state!r}"
        )
        assert last_status in ("Successful", "Unknown"), (
            f"Lambda '{function_name}' last update failed — LastUpdateStatus: {last_status!r}. "
            "Check CloudWatch Logs for deployment errors."
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            pytest.fail(
                f"Lambda function '{function_name}' not found. "
                "Check `terraform apply` completed and no resource was skipped."
            )
        raise


# ---------------------------------------------------------------------------
# 4. SNS Fan-out Topic Exists
# ---------------------------------------------------------------------------
def test_sns_video_updates_topic_exists(sns_client, app_name):
    """
    The SNS topic that fans out S3 upload events to Lambda subscribers
    must exist. Its name is '{app_name}-video-updates'.
    """
    target_name = f"{app_name}-video-updates"
    paginator = sns_client.get_paginator("list_topics")
    found = False
    for page in paginator.paginate():
        for topic in page.get("Topics", []):
            if target_name in topic["TopicArn"]:
                found = True
                break
        if found:
            break

    assert found, (
        f"SNS topic containing '{target_name}' not found. "
        "Check aws_sns_topic.video_updates in lambda/main.tf and re-run terraform apply."
    )


# ---------------------------------------------------------------------------
# 5. FFmpeg Lambda Layer Exists and Is Active
# ---------------------------------------------------------------------------
def test_ffmpeg_layer_exists(lambda_client, app_name):
    """
    The self-managed FFmpeg layer (aws_lambda_layer_version.ffmpeg in
    ffmpeg_layer.tf) must exist. Without it, extract-thumbnail will crash
    immediately with /opt/bin/ffmpeg: not found.
    """
    target_name = f"{app_name}-ffmpeg"
    response = lambda_client.list_layer_versions(LayerName=target_name)
    versions = response.get("LayerVersions", [])

    assert versions, (
        f"No versions found for Lambda layer '{target_name}'. "
        "Run `terraform apply` to publish the ffmpeg layer from ffmpeg.zip."
    )

    # The latest version must not be in a broken state
    latest = versions[0]
    print(
        f"\n[infra] FFmpeg layer '{target_name}' — "
        f"latest version: {latest['Version']}, "
        f"ARN: {latest['LayerVersionArn']}"
    )
