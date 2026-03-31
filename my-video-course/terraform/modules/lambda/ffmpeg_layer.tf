# Upload the FFmpeg zip to S3 first to bypass the 70MB PublishLayerVersion direct upload limit.
# S3 allows up to 250MB (unzipped) for Lambda Layers.
resource "aws_s3_object" "ffmpeg_zip" {
  bucket = var.s3_bucket_name
  key    = "layers/ffmpeg.zip"
  source = "${path.module}/ffmpeg.zip"
  etag   = filemd5("${path.module}/ffmpeg.zip")
}

resource "aws_lambda_layer_version" "ffmpeg" {
  s3_bucket           = var.s3_bucket_name
  s3_key              = aws_s3_object.ffmpeg_zip.key
  layer_name          = "${var.app_name}-ffmpeg"
  description         = "Self-managed FFmpeg binary for media processing (S3-sourced)"
  compatible_runtimes = ["python3.9", "python3.10", "python3.11", "python3.12", "nodejs18.x", "nodejs20.x"]
  
  # Tracks changes to the source zip to trigger a new layer version if the file changes.
  source_code_hash = filebase64sha256("${path.module}/ffmpeg.zip")

  depends_on = [aws_s3_object.ffmpeg_zip]
}

output "ffmpeg_layer_arn" {
  value = aws_lambda_layer_version.ffmpeg.arn
}
