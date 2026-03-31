resource "aws_lambda_layer_version" "ffmpeg" {
  filename            = "${path.module}/ffmpeg.zip"
  layer_name          = "${var.app_name}-ffmpeg"
  description         = "Self-managed FFmpeg binary for media processing"
  compatible_runtimes = ["python3.9", "python3.10", "python3.11", "python3.12", "nodejs18.x", "nodejs20.x"]
  
  # Ensure the file exists before attempting to create the layer
  source_code_hash = filebase64sha256("${path.module}/ffmpeg.zip")
}

output "ffmpeg_layer_arn" {
  value = aws_lambda_layer_version.ffmpeg.arn
}
