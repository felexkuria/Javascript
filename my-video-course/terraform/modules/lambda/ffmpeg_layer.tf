# --- PILLAR 4: Cloud-Native FFmpeg Layer (SAR) ---
# Deploying the FFmpeg layer via the AWS Serverless Application Repository (SAR)
# ensures that the layer version is provisioned within your own AWS account.
# This resolves the AccessDeniedException ('lambda:GetLayerVersion') often 
# encountered when referencing public layers across account boundaries.

resource "aws_serverlessapplicationrepository_cloudformation_stack" "ffmpeg_layer" {
  count          = var.create_ffmpeg_layer ? 1 : 0
  name           = "${var.app_name}-ffmpeg-sar"
  application_id = "arn:aws:serverlessrepo:us-east-1:145266761615:applications/ffmpeg-lambda-layer"
  capabilities   = ["CAPABILITY_IAM", "CAPABILITY_RESOURCE_POLICY"]

  # Version 4 is the community standard for most Python/Node runtimes
  semantic_version = "4.0.0"
}
