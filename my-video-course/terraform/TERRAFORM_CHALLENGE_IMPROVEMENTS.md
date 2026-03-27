# 🚀 Terraform Challenge: Day 11 - Dynamic Infrastructure Refactoring

As part of the **30-Day Terraform Challenge**, we've refactored the video course infrastructure to be more dynamic, scalable, and environment-aware. We focused on **Loops (`count`, `for_each`)** and **Conditionals** to reduce code duplication and implement production-ready patterns.

## 🛠️ Key Improvements

### 1. Dynamic Networking (DRY Subnets)
Instead of hardcoding individual public subnets, we've implemented a loop using `count` and the `cidrsubnet` function.
- **Before**: `aws_subnet.public_1` and `aws_subnet.public_2` defined as separate resources.
- **After**: A single `aws_subnet.public` resource using `count`. This allows us to scale to any number of AZs just by changing a variable.

### 2. Multi-Table DynamoDB with `for_each`
Setting up multiple DynamoDB tables is now managed through a local map.
- **Improved Maintainability**: Adding a new table (e.g., `comments` or `ratings`) only requires adding one line to a map, not a whole new resource block.
- **Dynamic IAM Policies**: We implemented a `for` loop within the IAM policy to automatically grant access to all created tables without manual ARN updates.

### 3. Environment-Aware Configuration (Day 11: Conditionals)
We've introduced a `locals` block in `main.tf` that acts as a configuration matrix.
- **Dynamic Specs**: The scaling policies (min/max size) now adapt automatically to the `environment`.
- **Cost Safe**: All environments currently use **`t3.micro`** by default to remain within the AWS Free Tier (common for newer accounts), while the dynamic scaling logic remains in place.
- **Safe Defaults**: Used the `lookup` function to provide a safe fallback to `dev` settings if an unknown environment is specified.

### 4. Zero-Downtime Deployment (Day 12: Lifecycle Handlers)
To ensure infrastructure updates never bring the application offline, we've implemented:
- **`create_before_destroy`**: Applied to Security Groups, Launch Templates, and the ASG to rotate resources without gaps in service.
- **Dynamic Naming**: Switched to `name_prefix` for Security Groups to allow new groups to be created before the old ones are deleted.
- **Instance Refresh Policies**: Configured rolling updates with health check grace periods to maintain application availability during code or config changes.

## 📝 Lessons Learned

1.  **Loops over Duplication**: Use `for_each` when creating resources that share the same structure but different configurations (like DynamoDB tables).
2.  **Conditionals for Environments**: Maps + `lookup` is the professional way to manage environment-specific variables, rather than a giant list of `if/else` logic.
3.  **Dynamic Blocks**: Used dynamic blocks for attributes that might vary in number, ensuring the HCL remains clean and readable.

## 🎯 Next Steps
- Implement **Remote State** with S3 and DynamoDB Locking (Day 15).
- Integrate **Terraform Workspaces** for better isolation.
