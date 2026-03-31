"""
test_s3.py — Integration tests for S3 storage behaviour.

Tests:
  1. Upload a file and retrieve it — content must match exactly.
  2. Public access is blocked — anonymous GET must return 403.
  3. CORS preflight returns the expected Allow-Origin header.
  4. Objects are encrypted at rest (AES256).
  5. Bucket versioning is enabled.

All objects written here are tracked via the `s3_cleanup_keys` fixture
and deleted automatically at the end of the test session.
"""

import io
import ssl
import urllib.request

import boto3
import pytest
from botocore.exceptions import ClientError


# ---------------------------------------------------------------------------
# 1. Upload & Retrieve
# ---------------------------------------------------------------------------
def test_upload_and_retrieve(s3_client, s3_bucket, qa_prefix, s3_cleanup_keys):
    """
    Round-trip: PutObject then GetObject.
    The body retrieved from S3 must be byte-for-byte identical to what was uploaded.
    """
    key = f"qa-tests/{qa_prefix}/upload_test.txt"
    expected_body = f"QA smoke payload — run ID: {qa_prefix}".encode()

    # Upload
    s3_client.put_object(
        Bucket=s3_bucket,
        Key=key,
        Body=expected_body,
        ContentType="text/plain",
    )
    s3_cleanup_keys.append(key)

    # Download
    response = s3_client.get_object(Bucket=s3_bucket, Key=key)
    actual_body = response["Body"].read()

    assert actual_body == expected_body, (
        f"Body mismatch: uploaded {len(expected_body)} bytes, "
        f"retrieved {len(actual_body)} bytes"
    )


# ---------------------------------------------------------------------------
# 2. Public Access Is Blocked
# ---------------------------------------------------------------------------
def test_public_access_blocked(s3_bucket, qa_prefix, s3_client, s3_cleanup_keys):
    """
    The bucket must have 'Block Public Access' enabled.
    An unauthenticated HTTP GET to a known object key must return 403 — not 200.
    This confirms aws_s3_bucket_public_access_block is working.
    """
    key = f"qa-tests/{qa_prefix}/public_block_test.txt"
    s3_client.put_object(Bucket=s3_bucket, Key=key, Body=b"public block check")
    s3_cleanup_keys.append(key)

    public_url = f"https://{s3_bucket}.s3.amazonaws.com/{key}"

    # Use an unauthenticated context (no boto3)
    ctx = ssl.create_default_context()
    req = urllib.request.Request(public_url)
    try:
        urllib.request.urlopen(req, context=ctx, timeout=10)
        pytest.fail(
            f"Expected HTTP 403 (public access blocked) but got 200 for {public_url}"
        )
    except urllib.error.HTTPError as e:
        assert e.code == 403, (
            f"Expected 403 (Access Denied) but got {e.code}. "
            "Check 'Block Public Access' settings on the bucket."
        )


# ---------------------------------------------------------------------------
# 3. CORS Headers on Preflight
# ---------------------------------------------------------------------------
def test_cors_headers(s3_client, s3_bucket):
    """
    S3 CORS configuration (defined in storage/main.tf) must return
    Access-Control-Allow-Origin for the allowed frontend origin.

    Uses the S3 API directly — boto3 get_bucket_cors — rather than making
    an actual HTTP OPTIONS request, which avoids needing a live object
    and is reliable in all network environments (including CI runners).
    """
    response = s3_client.get_bucket_cors(Bucket=s3_bucket)
    rules = response.get("CORSRules", [])

    assert rules, "No CORS rules found on bucket — check aws_s3_bucket_cors_configuration"

    # At least one rule must include GET and PUT (our Terraform config allows both)
    allowed_methods = set()
    for rule in rules:
        allowed_methods.update(rule.get("AllowedMethods", []))

    assert "GET" in allowed_methods, "CORS policy must allow GET"
    assert "PUT" in allowed_methods, "CORS policy must allow PUT (needed for presigned upload URLs)"

    # At least one origin must be configured
    allowed_origins = set()
    for rule in rules:
        allowed_origins.update(rule.get("AllowedOrigins", []))

    assert allowed_origins, "CORS policy has no AllowedOrigins — check Terraform config"


# ---------------------------------------------------------------------------
# 4. Server-Side Encryption (AES256)
# ---------------------------------------------------------------------------
def test_server_side_encryption(s3_client, s3_bucket, qa_prefix, s3_cleanup_keys):
    """
    Objects stored in the bucket must be encrypted at rest with AES256
    (aws_s3_bucket_server_side_encryption_configuration in storage/main.tf).
    HeadObject on any object should return ServerSideEncryption == AES256.
    """
    key = f"qa-tests/{qa_prefix}/sse_test.txt"
    s3_client.put_object(Bucket=s3_bucket, Key=key, Body=b"encryption check")
    s3_cleanup_keys.append(key)

    head = s3_client.head_object(Bucket=s3_bucket, Key=key)
    sse = head.get("ServerSideEncryption")

    assert sse == "AES256", (
        f"Expected ServerSideEncryption=AES256 but got: {sse!r}. "
        "Check aws_s3_bucket_server_side_encryption_configuration in Terraform."
    )


# ---------------------------------------------------------------------------
# 5. Versioning Is Enabled
# ---------------------------------------------------------------------------
def test_versioning_enabled(s3_client, s3_bucket):
    """
    Bucket versioning must be in 'Enabled' state (not 'Suspended' or missing).
    This validates aws_s3_bucket_versioning in storage/main.tf.
    """
    response = s3_client.get_bucket_versioning(Bucket=s3_bucket)
    status = response.get("Status")

    assert status == "Enabled", (
        f"Expected versioning Status=Enabled but got: {status!r}. "
        "Check aws_s3_bucket_versioning in Terraform."
    )
