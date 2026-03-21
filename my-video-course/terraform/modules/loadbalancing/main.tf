# Application Load Balancer
resource "aws_lb" "app" {
  count              = var.create_alb ? 1 : 0
  name               = "${var.app_name}-alb-modular"
  internal           = false
  load_balancer_type = "application"
  security_groups    = var.security_group_ids
  subnets            = var.subnet_ids

  enable_deletion_protection = false

  tags = {
    Name = "${var.app_name}-alb"
  }
}

resource "aws_lb_target_group" "app" {
  count       = var.create_alb ? 1 : 0
  name        = "${var.app_name}-tg-modular"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 10
  }
}

# ACM Certificate
resource "aws_acm_certificate" "cert" {
  count             = var.create_alb && var.enable_https ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_name}-cert"
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.create_alb && var.enable_https ? {
    for dvo in aws_acm_certificate.cert[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.hosted_zone_id
}

resource "aws_acm_certificate_validation" "cert" {
  count                   = var.create_alb && var.enable_https ? 1 : 0
  certificate_arn         = aws_acm_certificate.cert[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# Route 53 Record for ALB
resource "aws_route53_record" "app" {
  count   = var.create_alb && var.domain_name != null ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.app[0].dns_name
    zone_id                = aws_lb.app[0].zone_id
    evaluate_target_health = true
  }
}

# Listeners
resource "aws_lb_listener" "http" {
  count             = var.create_alb ? 1 : 0
  load_balancer_arn = aws_lb.app[0].arn
  port              = "80"
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.enable_https ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.enable_https ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.app[0].arn
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.create_alb && var.enable_https ? 1 : 0
  load_balancer_arn = aws_lb.app[0].arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate_validation.cert[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[0].arn
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count               = var.create_asg ? 1 : 0
  alarm_name          = "${var.app_name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "120"
  statistic           = "Average"
  threshold           = "70"
  alarm_description   = "This metric monitors ec2 cpu utilization"
  alarm_actions       = var.scale_up_policy_arns
  
  dimensions = {
    AutoScalingGroupName = var.asg_name
  }
}

resource "aws_cloudwatch_metric_alarm" "cpu_low" {
  count               = var.create_asg ? 1 : 0
  alarm_name          = "${var.app_name}-cpu-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "120"
  statistic           = "Average"
  threshold           = "30"
  alarm_description   = "This metric monitors ec2 cpu utilization"
  alarm_actions       = var.scale_down_policy_arns
  
  dimensions = {
    AutoScalingGroupName = var.asg_name
  }
}
