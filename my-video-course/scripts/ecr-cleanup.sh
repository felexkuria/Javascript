#!/usr/bin/env bash
# =============================================================
# ECR Cleanup Script — Remove untagged / old images
# Usage:
#   ./scripts/ecr-cleanup.sh                   # dry run (default)
#   ./scripts/ecr-cleanup.sh --delete          # actually delete
#   ./scripts/ecr-cleanup.sh --delete --keep 5 # keep last 5 tagged images
# =============================================================
set -euo pipefail

REPO="${ECR_REPO:-video-course-app}"
REGION="${AWS_REGION:-us-east-1}"
KEEP="${KEEP:-5}"       # number of most-recent tagged images to keep
DRY_RUN=true

# ── Parse args ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --delete) DRY_RUN=false;;
    --keep)   KEEP="$2"; shift;;
    --repo)   REPO="$2"; shift;;
    --region) REGION="$2"; shift;;
    *) echo "Unknown flag: $1"; exit 1;;
  esac
  shift
done

echo "===================================================="
echo "  ECR Cleanup — repo: $REPO  region: $REGION"
echo "  Keep last $KEEP tagged images"
[[ "$DRY_RUN" == "true" ]] && echo "  MODE: DRY RUN (pass --delete to actually remove)" \
                            || echo "  MODE: DELETE ⚠"
echo "===================================================="

# ── 1. Untagged images (imageTag = null / None) ───────────────
echo ""
echo "▶ Fetching UNTAGGED images..."

UNTAGGED=$(aws ecr describe-images \
  --repository-name "$REPO" \
  --region "$REGION" \
  --filter "tagStatus=UNTAGGED" \
  --query 'imageDetails[*].imageDigest' \
  --output json)

UNTAGGED_COUNT=$(echo "$UNTAGGED" | jq 'length')
echo "  Found $UNTAGGED_COUNT untagged image(s)"

if [[ "$UNTAGGED_COUNT" -gt 0 ]]; then
  # Build the imageIds array for batch-delete
  IMAGE_IDS=$(echo "$UNTAGGED" | jq '[.[] | {imageDigest: .}]')
  if [[ "$DRY_RUN" == "false" ]]; then
    echo "  Deleting $UNTAGGED_COUNT untagged image(s)..."
    aws ecr batch-delete-image \
      --repository-name "$REPO" \
      --region "$REGION" \
      --image-ids "$IMAGE_IDS" \
      --output table
  else
    echo "  [DRY RUN] Would delete these digests:"
    echo "$UNTAGGED" | jq -r '.[]'
  fi
fi

# ── 2. Old tagged images (keep only the N most recent) ────────
echo ""
echo "▶ Fetching TAGGED images, keeping newest $KEEP..."

# Get all tagged images sorted by push date descending
ALL_TAGGED=$(aws ecr describe-images \
  --repository-name "$REPO" \
  --region "$REGION" \
  --filter "tagStatus=TAGGED" \
  --query 'imageDetails[*].{digest:imageDigest,pushed:imagePushedAt,tags:imageTags}' \
  --output json | jq 'sort_by(.pushed) | reverse')

TOTAL_TAGGED=$(echo "$ALL_TAGGED" | jq 'length')
echo "  Total tagged images: $TOTAL_TAGGED"

if [[ "$TOTAL_TAGGED" -le "$KEEP" ]]; then
  echo "  ✅ Nothing to delete — only $TOTAL_TAGGED tagged image(s), keeping $KEEP"
else
  # Images to delete = everything after index KEEP-1
  TO_DELETE=$(echo "$ALL_TAGGED" | jq --argjson k "$KEEP" '.[$k:]')
  DELETE_COUNT=$(echo "$TO_DELETE" | jq 'length')
  echo "  Will delete $DELETE_COUNT old tagged image(s):"
  echo "$TO_DELETE" | jq -r '.[] | "    \(.pushed)  \(.digest[:16])  tags: \(.tags | join(", "))"'

  if [[ "$DRY_RUN" == "false" ]]; then
    DELETE_IDS=$(echo "$TO_DELETE" | jq '[.[] | {imageDigest: .digest}]')
    aws ecr batch-delete-image \
      --repository-name "$REPO" \
      --region "$REGION" \
      --image-ids "$DELETE_IDS" \
      --output table
    echo "  ✅ Deleted $DELETE_COUNT old images"
  else
    echo "  [DRY RUN] Would delete $DELETE_COUNT image(s) listed above"
  fi
fi

# ── 3. Summary ────────────────────────────────────────────────
echo ""
echo "▶ Current ECR state after cleanup:"
aws ecr describe-images \
  --repository-name "$REPO" \
  --region "$REGION" \
  --query 'imageDetails[*].{Pushed:imagePushedAt,SizeMB:to_string(imageSizeInBytes),Tags:join(`, `,imageTags)}' \
  --output table 2>/dev/null | head -30

echo ""
echo "✅ Done. Run with --delete to actually remove images."
