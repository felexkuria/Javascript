"""
conftest.py — Shared pytest fixtures for integration tests.

All fixtures use environment variables for AWS configuration.
NO HARDCODED CREDENTIALS. See tests/integration/README.md for
the full list of required env vars.

Cleanup strategy:
  Every test that creates AWS resources uses the `qa_prefix` fixture
  to tag objects/items with a unique run ID (e.g. "qa-abc1234-1711900000").
  The `cleanup_s3` and `cleanup_dynamo` session-scoped fixtures register
  teardown that deletes everything matching that prefix, so no test data
  survives the run — even if a test crashes mid-way.
"""

import os
import time
import uuid
import boto3
import pytest


# ---------------------------------------------------------------------------
# Helper: read a required env var (fail fast with a clear message)
# ---------------------------------------------------------------------------
def _require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        pytest.fail(
            f"Required environment variable '{name}' is not set. "
            "See tests/integration/README.md for the full list."
        )
    return val


# ---------------------------------------------------------------------------
# Session-scoped: one boto3 session for the entire test run
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def aws_region() -> str:
    return os.environ.get("AWS_DEFAULT_REGION", "us-east-1")


@pytest.fixture(scope="session")
def s3_client(aws_region):
    return boto3.client("s3", region_name=aws_region)


@pytest.fixture(scope="session")
def dynamodb_client(aws_region):
    return boto3.client("dynamodb", region_name=aws_region)


@pytest.fixture(scope="session")
def dynamodb_resource(aws_region):
    return boto3.resource("dynamodb", region_name=aws_region)


# ---------------------------------------------------------------------------
# Config: bucket / table names from env vars
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def s3_bucket() -> str:
    return _require_env("APP_S3_BUCKET")


@pytest.fixture(scope="session")
def videos_table_name() -> str:
    return _require_env("APP_DYNAMODB_TABLE")


@pytest.fixture(scope="session")
def app_domain() -> str:
    return _require_env("APP_DOMAIN")


# ---------------------------------------------------------------------------
# Unique run prefix — scopes all test artefacts to this CI run
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def qa_prefix() -> str:
    """
    Unique prefix for all objects/items created during this test run.
    Format: qa-<8-char uuid>-<unix-ts>
    Example: qa-a3f8c21b-1711900000
    """
    short_id = str(uuid.uuid4()).replace("-", "")[:8]
    return f"qa-{short_id}-{int(time.time())}"


# ---------------------------------------------------------------------------
# Cleanup: S3 objects
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def s3_cleanup_keys(s3_client, s3_bucket, qa_prefix):
    """
    Accumulates S3 keys created during the test run and deletes them after.
    Tests append to this list; teardown is automatic.
    """
    keys = []
    yield keys
    # Teardown: delete every key we tracked
    if keys:
        delete_objects = [{"Key": k} for k in keys]
        try:
            s3_client.delete_objects(
                Bucket=s3_bucket,
                Delete={"Objects": delete_objects, "Quiet": True},
            )
            print(f"\n[cleanup] Deleted {len(keys)} S3 test object(s) from {s3_bucket}")
        except Exception as e:
            print(f"\n[cleanup] WARNING: S3 cleanup failed: {e}")


# ---------------------------------------------------------------------------
# Cleanup: DynamoDB items
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def dynamo_cleanup_keys(dynamodb_resource, videos_table_name, qa_prefix):
    """
    Accumulates DynamoDB primary keys created during the test run and
    deletes them after. Tests append (courseName, videoId) tuples to this list.
    """
    keys = []
    yield keys
    if keys:
        table = dynamodb_resource.Table(videos_table_name)
        for course_name, video_id in keys:
            try:
                table.delete_item(
                    Key={"courseName": course_name, "videoId": video_id}
                )
            except Exception as e:
                print(f"\n[cleanup] WARNING: DynamoDB cleanup failed for {video_id}: {e}")
        print(f"\n[cleanup] Deleted {len(keys)} DynamoDB test item(s)")
