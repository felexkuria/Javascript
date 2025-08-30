#!/bin/bash
# macOS script to sync videos to S3
# Place this script in your video download folder and run it

# Configuration
S3_BUCKET="video-course-bucket-047ad47c"
S3_PREFIX="videos/dev-ops-bootcamp_202201/"
LOCAL_VIDEO_PATH="$(pwd)"

echo "🎬 Starting video sync to S3..."
echo "📁 Local Path: $LOCAL_VIDEO_PATH"
echo "☁️  S3 Destination: s3://$S3_BUCKET/$S3_PREFIX"

# Check if AWS CLI exists
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Install with: brew install awscli"
    exit 1
fi

# Find all video files
echo "🔍 Scanning for video files..."
video_files=$(find . -maxdepth 2 -type f \( -name "*.mp4" -o -name "*.mkv" -o -name "*.avi" -o -name "*.mov" -o -name "*.wmv" \))

if [ -z "$video_files" ]; then
    echo "❌ No video files found in current directory"
    exit 1
fi

echo "📊 Found $(echo "$video_files" | wc -l) video files"

# Upload each video
while IFS= read -r file; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        s3_key="${S3_PREFIX}${filename}"
        
        echo "⬆️  Uploading: $filename"
        
        if aws s3 cp "$file" "s3://$S3_BUCKET/$s3_key" --no-progress; then
            echo "✅ Uploaded: $filename"
        else
            echo "❌ Failed: $filename"
        fi
    fi
done <<< "$video_files"

echo "🎉 Sync completed!"
echo "🌐 Videos will appear at: https://skool.shopmultitouch.com/course/dev-ops-bootcamp_202201"