# PowerShell script to sync videos from Windows EC2 to S3
# Run this on your Windows EC2 instance

# Configuration
$S3_BUCKET = "video-course-bucket-047ad47c"
$S3_PREFIX = "videos/dev-ops-bootcamp_202201/"
$LOCAL_VIDEO_PATH = "C:\Downloads\Videos"  # Change this to your video folder path

# Install AWS CLI if not installed
if (!(Get-Command "aws" -ErrorAction SilentlyContinue)) {
    Write-Host "AWS CLI not found. Please install AWS CLI first."
    Write-Host "Download from: https://aws.amazon.com/cli/"
    exit 1
}

# Check if local path exists
if (!(Test-Path $LOCAL_VIDEO_PATH)) {
    Write-Host "Video path not found: $LOCAL_VIDEO_PATH"
    Write-Host "Please update LOCAL_VIDEO_PATH in the script"
    exit 1
}

Write-Host "Starting video sync to S3..."
Write-Host "Local Path: $LOCAL_VIDEO_PATH"
Write-Host "S3 Destination: s3://$S3_BUCKET/$S3_PREFIX"

# Get all video files
$videoFiles = Get-ChildItem -Path $LOCAL_VIDEO_PATH -Recurse -Include *.mp4,*.mkv,*.avi,*.mov,*.wmv

Write-Host "Found $($videoFiles.Count) video files"

foreach ($file in $videoFiles) {
    $relativePath = $file.FullName.Substring($LOCAL_VIDEO_PATH.Length + 1)
    $s3Key = "$S3_PREFIX$relativePath" -replace '\\', '/'
    
    Write-Host "Uploading: $($file.Name) -> $s3Key"
    
    try {
        aws s3 cp "$($file.FullName)" "s3://$S3_BUCKET/$s3Key" --no-progress
        Write-Host "✅ Uploaded: $($file.Name)"
    }
    catch {
        Write-Host "❌ Failed: $($file.Name) - $($_.Exception.Message)"
    }
}

Write-Host "Sync completed!"
Write-Host "Videos will appear at: https://skool.shopmultitouch.com/course/dev-ops-bootcamp_202201"