@echo off
REM Batch script to sync videos from Windows EC2 to S3
REM Alternative to PowerShell script

SET S3_BUCKET=video-course-bucket-047ad47c
SET S3_PREFIX=videos/dev-ops-bootcamp_202201/
SET LOCAL_VIDEO_PATH=C:\Downloads\Videos

echo Starting video sync to S3...
echo Local Path: %LOCAL_VIDEO_PATH%
echo S3 Destination: s3://%S3_BUCKET%/%S3_PREFIX%

REM Check if AWS CLI exists
aws --version >nul 2>&1
if errorlevel 1 (
    echo AWS CLI not found. Please install AWS CLI first.
    echo Download from: https://aws.amazon.com/cli/
    pause
    exit /b 1
)

REM Check if local path exists
if not exist "%LOCAL_VIDEO_PATH%" (
    echo Video path not found: %LOCAL_VIDEO_PATH%
    echo Please update LOCAL_VIDEO_PATH in the script
    pause
    exit /b 1
)

REM Sync all videos recursively
echo Syncing videos...
aws s3 sync "%LOCAL_VIDEO_PATH%" "s3://%S3_BUCKET%/%S3_PREFIX%" --include="*.mp4" --include="*.mkv" --include="*.avi" --include="*.mov" --include="*.wmv"

echo Sync completed!
echo Videos will appear at: https://skool.shopmultitouch.com/course/dev-ops-bootcamp_202201
pause