# Pillar 6: Observability & Telemetry - CloudWatch Dashboard
# This resource creates the "Senior Data Engineer" view of the pipeline health.

resource "aws_cloudwatch_dashboard" "pipeline_health" {
  dashboard_name = "${var.app_name}-pipeline-health-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "${var.app_name}-ingestion-dlq-${var.environment}"]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Pipeline DLQ Depth (Critical Failures)"
          color  = "#d62728"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["VideoPipeline/Ingestion", "ExtractionRetryCount", { "label": "Self-Correction Retries", "color": "#ff7f0e" }],
            ["VideoPipeline/Ingestion", "ExtractionSuccess", { "label": "Total Success", "color": "#2ca02c" }]
          ]
          view    = "singleValue"
          region  = var.aws_region
          title   = "AI Extraction Health"
          period  = 86400
          stat    = "Sum"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          metrics = [
            ["VideoPipeline/Ingestion", "TotalProcessingLatency", { "label": "End-to-End Latency" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Pipeline Processing Latency (Seconds)"
          period  = 300
          stat    = "Average"
        }
      }
    ]
  })
}

# --- CloudWatch Alarms (Pillar 3) ---
resource "aws_cloudwatch_metric_alarm" "dlq_alarm" {
  alarm_name          = "${var.app_name}-extraction-failure-dlq"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = "60"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Critical: Video failed extraction and is in DLQ"
  
  dimensions = {
    QueueName = "${var.app_name}-ingestion-dlq-${var.environment}"
  }

  # In real world, this would trigger an SNS topic for email/slack
  # alarm_actions = [var.sns_topic_arn]
}
