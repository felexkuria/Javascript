"""
test_dynamodb.py — Integration tests for DynamoDB tables and GSIs.

Tests:
  1. PutItem then GetItem — fields must round-trip correctly.
  2. UpdateItem changes the correct attribute.
  3. Global Secondary Index 'VideoIdIndex' is in ACTIVE state.
  4. A query against VideoIdIndex returns the item we inserted.
  5. A conditional write that violates a ConditionExpression raises the
     correct exception (ConditionalCheckFailedException) — ensures
     fine-grained write control is working.

All items are keyed under qa_prefix and cleaned up after the session.
"""

import time
import pytest
from botocore.exceptions import ClientError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_item(qa_prefix: str, suffix: str = "") -> dict:
    """Build a minimal but realistic videos-table item."""
    video_id = f"{qa_prefix}-vid{suffix}"
    return {
        "courseName": f"{qa_prefix}-course",
        "videoId": video_id,
        "title": f"QA Test Video {suffix}",
        "s3Key": f"videos/{qa_prefix}-course/{video_id}.mp4",
        "watched": False,
        "status": "PROCESSING",
        "createdAt": "2026-01-01T00:00:00Z",
    }


# ---------------------------------------------------------------------------
# 1. PutItem → GetItem round-trip
# ---------------------------------------------------------------------------
def test_put_and_get(
    dynamodb_resource, videos_table_name, qa_prefix, dynamo_cleanup_keys
):
    """
    Write an item, read it back, assert all top-level fields match.
    Validates basic read/write IAM permissions and table schema.
    """
    table = dynamodb_resource.Table(videos_table_name)
    item = _make_item(qa_prefix, "-1")
    table.put_item(Item=item)
    dynamo_cleanup_keys.append((item["courseName"], item["videoId"]))

    response = table.get_item(
        Key={"courseName": item["courseName"], "videoId": item["videoId"]}
    )
    retrieved = response.get("Item")

    assert retrieved is not None, (
        f"Item not found after put: courseName={item['courseName']}, "
        f"videoId={item['videoId']}"
    )
    assert retrieved["title"] == item["title"]
    assert retrieved["s3Key"] == item["s3Key"]
    assert retrieved["watched"] == item["watched"]


# ---------------------------------------------------------------------------
# 2. UpdateItem modifies the correct field
# ---------------------------------------------------------------------------
def test_update_item(
    dynamodb_resource, videos_table_name, qa_prefix, dynamo_cleanup_keys
):
    """
    Write an item with status=PROCESSING, update it to ONLINE,
    verify the update landed on the correct field only.
    """
    table = dynamodb_resource.Table(videos_table_name)
    item = _make_item(qa_prefix, "-2")
    table.put_item(Item=item)
    dynamo_cleanup_keys.append((item["courseName"], item["videoId"]))

    thumbnail_url = f"https://example.com/thumbnails/{qa_prefix}.jpg"
    table.update_item(
        Key={"courseName": item["courseName"], "videoId": item["videoId"]},
        UpdateExpression="SET #s = :online, thumbnailUrl = :thumb",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":online": "ONLINE", ":thumb": thumbnail_url},
    )

    retrieved = table.get_item(
        Key={"courseName": item["courseName"], "videoId": item["videoId"]}
    )["Item"]

    assert retrieved["status"] == "ONLINE", (
        f"Expected status=ONLINE but got {retrieved['status']!r}"
    )
    assert retrieved["thumbnailUrl"] == thumbnail_url
    # Untouched fields must survive
    assert retrieved["title"] == item["title"]
    assert retrieved["s3Key"] == item["s3Key"]


# ---------------------------------------------------------------------------
# 3. VideoIdIndex GSI is ACTIVE
# ---------------------------------------------------------------------------
def test_gsi_active(dynamodb_client, videos_table_name):
    """
    The 'VideoIdIndex' GSI defined in storage/main.tf must be in ACTIVE state.
    A non-ACTIVE GSI means queries against it will fail at runtime.
    """
    response = dynamodb_client.describe_table(TableName=videos_table_name)
    gsis = response["Table"].get("GlobalSecondaryIndexes", [])

    gsi_map = {g["IndexName"]: g["IndexStatus"] for g in gsis}

    assert "VideoIdIndex" in gsi_map, (
        f"GSI 'VideoIdIndex' not found on table '{videos_table_name}'. "
        f"Existing GSIs: {list(gsi_map.keys())}"
    )
    assert gsi_map["VideoIdIndex"] == "ACTIVE", (
        f"GSI 'VideoIdIndex' is not ACTIVE — current status: {gsi_map['VideoIdIndex']!r}"
    )


# ---------------------------------------------------------------------------
# 4. VideoIdIndex GSI is queryable
# ---------------------------------------------------------------------------
def test_gsi_queryable(
    dynamodb_resource, dynamodb_client, videos_table_name, qa_prefix, dynamo_cleanup_keys
):
    """
    Insert a known item, then query it by videoId via VideoIdIndex.
    Validates that the GSI is not only ACTIVE but actually serves reads.
    """
    import boto3.dynamodb.conditions as cond

    table = dynamodb_resource.Table(videos_table_name)
    item = _make_item(qa_prefix, "-3")
    table.put_item(Item=item)
    dynamo_cleanup_keys.append((item["courseName"], item["videoId"]))

    # GSI propagation can take a moment — allow up to 5 seconds
    result = None
    for _ in range(5):
        response = table.query(
            IndexName="VideoIdIndex",
            KeyConditionExpression=cond.Key("videoId").eq(item["videoId"]),
        )
        if response.get("Items"):
            result = response["Items"][0]
            break
        time.sleep(1)

    assert result is not None, (
        f"Query on VideoIdIndex returned no results for videoId={item['videoId']}. "
        "The GSI may not have been propagated yet — increase the retry window if flaky."
    )
    assert result["courseName"] == item["courseName"]


# ---------------------------------------------------------------------------
# 5. Conditional write raises ConditionalCheckFailedException
# ---------------------------------------------------------------------------
def test_conditional_write_conflict(
    dynamodb_resource, videos_table_name, qa_prefix, dynamo_cleanup_keys
):
    """
    Write an item, then try to PutItem with attribute_not_exists(videoId)
    condition. The second write must be rejected with ConditionalCheckFailedException.
    This proves conditional expressions are enforced — critical for preventing
    duplicate video registrations.
    """
    table = dynamodb_resource.Table(videos_table_name)
    item = _make_item(qa_prefix, "-4")
    table.put_item(Item=item)
    dynamo_cleanup_keys.append((item["courseName"], item["videoId"]))

    with pytest.raises(ClientError) as exc_info:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(videoId)",
        )

    error_code = exc_info.value.response["Error"]["Code"]
    assert error_code == "ConditionalCheckFailedException", (
        f"Expected ConditionalCheckFailedException but got: {error_code}"
    )
