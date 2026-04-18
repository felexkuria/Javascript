# This file implements the AWS Step Functions orchestrator and SQS DLQs.
# (Refreshed to clear linter cache)

# --- SQS Dead Letter Queues ---
resource "aws_sqs_queue" "pipeline_dlq" {
  count                     = var.create_pipeline_queue ? 1 : 0
  name                      = "${var.app_name}-ingestion-dlq-${var.environment}"
  message_retention_seconds = 1209600 # 14 days
}

# --- CloudWatch Metric Alarms for DLQ ---
resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  count               = var.create_pipeline_queue ? 1 : 0
  alarm_name          = "${var.app_name}-dlq-alarm-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "This alarm fires if any message enters the ingestion DLQ."
  dimensions = {
    QueueName = aws_sqs_queue.pipeline_dlq[0].name
  }
}

# --- IAM Role for Step Functions ---
resource "aws_iam_role" "sfn_role" {
  count = var.create_ingestion_workflow ? 1 : 0
  name  = "${var.app_name}-sfn-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "sfn_policy" {
  count = var.create_ingestion_workflow ? 1 : 0
  name  = "${var.app_name}-sfn-policy-${var.environment}"
  role  = aws_iam_role.sfn_role[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "*" # Restrict this to specific Lambdas if possible
      },
      var.create_pipeline_queue ? {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.pipeline_dlq[0].arn
      } : {
        Effect   = "Allow"
        Action   = ["sqs:GetQueueAttributes"] # Placeholder if no queue exists
        Resource = "*"
      }
    ]
  })
}

# --- Step Function Definition ---
resource "aws_sfn_state_machine" "ingestion_workflow" {
  count    = var.create_ingestion_workflow ? 1 : 0
  name     = "${var.app_name}-ingestion-v2-${var.environment}"
  role_arn = aws_iam_role.sfn_role[0].arn

  definition = jsonencode({
    Comment = "Hardened Video Ingestion Pipeline"
    StartAt = "InitDBStatus"
    States = {
      InitDBStatus = {
        Type     = "Task"
        Resource = aws_lambda_function.add_video_to_db[0].arn
        Next     = "ParallelProcessing"
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "HandleFailure"
        }]
      }
      ParallelProcessing = {
        Type = "Parallel"
        Next = "AI_Extraction"
        Branches = [
          {
            StartAt = "ExtractThumbnail"
            States = {
              ExtractThumbnail = {
                Type     = "Task"
                Resource = aws_lambda_function.extract_thumbnail[0].arn
                End      = true
              }
            }
          },
          {
            StartAt = "StartTranscribe"
            States = {
              StartTranscribe = {
                Type     = "Task"
                Resource = aws_lambda_function.start_transcribe[0].arn
                End      = true
              }
            }
          }
        ]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "HandleFailure"
        }]
      }
      AI_Extraction = {
        Type     = "Task"
        Resource = aws_lambda_function.on_transcribe_complete.arn
        End      = true
        Retry = [{
          ErrorEquals     = ["States.ALL"]
          IntervalSeconds = 5
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "HandleFailure"
        }]
      }
      HandleFailure = {
        Type     = "Task"
        Resource = "arn:aws:states:::sqs:sendMessage"
        Parameters = {
          QueueUrl = var.create_pipeline_queue ? aws_sqs_queue.pipeline_dlq[0].url : "DISABLED"
          MessageBody = {
            "Input.$" = "$"
            "Error"   = "Pipeline execution failed"
          }
        }
        End = true
      }
    }
  })
}

# --- Trigger Step Function from S3 via EventBridge ---
# (Removing the old SNS target and moving to EventBridge for direct SFN trigger)
resource "aws_cloudwatch_event_rule" "s3_upload" {
  count       = var.create_ingestion_workflow ? 1 : 0
  name        = "${var.app_name}-s3-upload-trigger"
  description = "Trigger Step Function on S3 Video upload"
  event_pattern = jsonencode({
    source      = ["aws.s3"]
    detail-type = ["Object Created"]
    detail = {
      bucket = { name = [var.s3_bucket_name] }
      object = { key = [{ prefix = "videos/" }] }
    }
  })
}

resource "aws_cloudwatch_event_target" "sfn_target" {
  count     = var.create_ingestion_workflow ? 1 : 0
  rule      = aws_cloudwatch_event_rule.s3_upload[0].name
  target_id = "StartIngestionSFN"
  arn       = aws_sfn_state_machine.ingestion_workflow[0].arn
  role_arn  = aws_iam_role.sfn_eb_role[0].arn
}

resource "aws_iam_role" "sfn_eb_role" {
  count = var.create_ingestion_workflow ? 1 : 0
  name  = "${var.app_name}-eb-to-sfn-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "sfn_eb_policy" {
  count = var.create_ingestion_workflow ? 1 : 0
  name  = "${var.app_name}-eb-to-sfn-policy"
  role  = aws_iam_role.sfn_eb_role[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["states:StartExecution"]
      Resource = aws_sfn_state_machine.ingestion_workflow[0].arn
    }]
  })
}
