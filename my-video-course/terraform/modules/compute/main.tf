# ECR Repository
resource "aws_ecr_repository" "main" {
  count                = var.create_ecr_repo ? 1 : 0
  name                 = var.app_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.app_name}-ecr"
  }
}

# Launch Template
resource "aws_launch_template" "app" {
  count         = var.create_asg ? 1 : 0
  name_prefix   = "${var.app_name}-"
  image_id      = var.ami_id
  instance_type = var.instance_type
  key_name      = var.key_pair_name

  vpc_security_group_ids = var.security_group_ids

  iam_instance_profile {
    name = var.iam_instance_profile_name
  }

  user_data = var.user_data_base64

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.app_name}-instance"
    }
  }

  tag_specifications {
    resource_type = "volume"
    tags = {
      Name = "${var.app_name}-volume"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Auto Scaling Group
resource "aws_autoscaling_group" "app" {
  count                     = var.create_asg ? 1 : 0
  name                      = "${var.app_name}-asg"
  vpc_zone_identifier       = var.subnet_ids
  target_group_arns         = var.target_group_arns
  health_check_type         = "ELB"
  health_check_grace_period = 300

  min_size         = var.min_size
  max_size         = var.max_size
  desired_capacity = var.desired_capacity

  launch_template {
    id      = aws_launch_template.app[0].id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.app_name}-asg"
    propagate_at_launch = true
  }

  # Auto-replace instances when user_data or the Launch Template changes
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 60
    }
  }

  lifecycle {
    create_before_destroy = true
  }

  wait_for_capacity_timeout = "10m"
}

# Auto Scaling Policies
resource "aws_autoscaling_policy" "scale_up" {
  count                  = var.create_asg ? 1 : 0
  name                   = "${var.app_name}-scale-up"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.app[0].name
}

resource "aws_autoscaling_policy" "scale_down" {
  count                  = var.create_asg ? 1 : 0
  name                   = "${var.app_name}-scale-down"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.app[0].name
}
resource "aws_ecr_lifecycle_policy" "main" {
  count      = var.create_ecr_repo ? 1 : 0
  repository = aws_ecr_repository.main[0].name

  policy = <<EOF
{
    "rules": [
        {
            "rulePriority": 1,
            "description": "Expire untagged images older than 1 day",
            "selection": {
                "tagStatus": "untagged",
                "countType": "sinceImagePushed",
                "countUnit": "days",
                "countNumber": 1
            },
            "action": {
                "type": "expire"
            }
        },
        {
            "rulePriority": 2,
            "description": "Expire dev tags older than 7 days",
            "selection": {
                "tagStatus": "tagged",
                "tagPrefixList": ["dev-", "feature-"],
                "countType": "sinceImagePushed",
                "countUnit": "days",
                "countNumber": 7
            },
            "action": {
                "type": "expire"
            }
        },
        {
            "rulePriority": 3,
            "description": "Keep last 20 tagged images (Prune old SHAs)",
            "selection": {
                "tagStatus": "any",
                "countType": "imageCountMoreThan",
                "countNumber": 20
            },
            "action": {
                "type": "expire"
            }
        }
    ]
}
EOF
}
