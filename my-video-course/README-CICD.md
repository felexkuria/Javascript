# CI/CD Pipeline Setup

This guide explains how to set up automated deployment using GitHub Actions.

## 🚀 Quick Setup

### 1. **Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/video-course-app.git
git push -u origin main
```

### 2. **Configure GitHub Secrets**
Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key

### 3. **Setup Terraform Backend (Optional)**
Run the "Setup Terraform Backend" workflow manually:
- Go to Actions tab → "Setup Terraform Backend" → Run workflow
- Copy the generated S3 bucket name
- Update `terraform/backend.tf` with the bucket name
- Uncomment the backend configuration

### 4. **Deploy**
Push changes to `main` branch to trigger automatic deployment:
```bash
git add .
git commit -m "Deploy to production"
git push origin main
```

## 📋 What the Pipeline Does

### **On Every Push to Main:**
1. **Build Docker Image**: Creates linux/amd64 image for EC2 compatibility
2. **Push to ECR**: Uploads image to Amazon Elastic Container Registry
3. **Run Terraform**: Updates infrastructure if needed
4. **Refresh Instances**: Triggers ASG to pull new Docker image

### **On Pull Requests:**
1. **Build & Test**: Validates Docker build
2. **Terraform Plan**: Shows infrastructure changes (no apply)

## 🔧 Pipeline Configuration

### **Workflow Files:**
- `.github/workflows/deploy.yml`: Main CI/CD pipeline
- `.github/workflows/terraform-backend.yml`: One-time backend setup

### **Environment Variables:**
```yaml
AWS_REGION: us-east-1
ECR_REPOSITORY: video-course-app
```

### **Deployment Steps:**
1. Checkout code
2. Configure AWS credentials
3. Login to ECR
4. Build & push Docker image
5. Setup Terraform
6. Plan infrastructure changes
7. Apply changes (main branch only)
8. Refresh EC2 instances

## 🛠️ Customization

### **Change Deployment Branch:**
Edit `.github/workflows/deploy.yml`:
```yaml
on:
  push:
    branches: [ production ]  # Change from 'main'
```

### **Add Environment-Specific Deployments:**
```yaml
strategy:
  matrix:
    environment: [staging, production]
```

### **Add Tests:**
```yaml
- name: Run Tests
  run: |
    npm install
    npm test
```

## 🔍 Monitoring Deployments

### **GitHub Actions:**
- View deployment status in Actions tab
- Check logs for each step
- Monitor build times and success rates

### **AWS Console:**
- **ECR**: Verify new images are pushed
- **EC2**: Check instance refresh status
- **ALB**: Monitor target health
- **CloudWatch**: View application logs

## 🚨 Troubleshooting

### **Common Issues:**

**1. AWS Credentials Error**
```
Error: Could not load credentials from any providers
```
**Fix**: Verify GitHub secrets are set correctly

**2. Terraform State Lock**
```
Error: Error acquiring the state lock
```
**Fix**: Wait for other deployments to complete or break lock manually

**3. Docker Build Fails**
```
Error: failed to solve: process "/bin/sh -c npm install" didn't complete successfully
```
**Fix**: Check package.json and dependencies

**4. Instance Refresh Timeout**
```
Error: Instance refresh did not complete
```
**Fix**: Check EC2 instance logs and health checks

### **Manual Deployment:**
If CI/CD fails, deploy manually:
```bash
# Build and push image
./aws/deploy.sh

# Apply Terraform
cd terraform
terraform apply

# Refresh instances
aws autoscaling start-instance-refresh --auto-scaling-group-name video-course-app-asg
```

## 📊 Pipeline Metrics

### **Typical Deployment Times:**
- Docker Build: 3-5 minutes
- Terraform Apply: 2-3 minutes
- Instance Refresh: 5-10 minutes
- **Total**: 10-18 minutes

### **Success Rate Targets:**
- Build Success: >95%
- Deployment Success: >90%
- Health Check Pass: >98%

## 🔐 Security Best Practices

### **Secrets Management:**
- Use GitHub Secrets for sensitive data
- Rotate AWS keys regularly
- Use IAM roles with minimal permissions

### **Infrastructure Security:**
- Enable Terraform state encryption
- Use S3 bucket versioning
- Implement branch protection rules

### **Monitoring:**
- Set up CloudWatch alarms
- Monitor deployment failures
- Track security vulnerabilities

## 🎯 Next Steps

1. **Add Staging Environment**: Deploy to staging before production
2. **Implement Blue/Green Deployments**: Zero-downtime deployments
3. **Add Automated Tests**: Unit, integration, and E2E tests
4. **Set up Monitoring**: Application performance monitoring
5. **Implement Rollback**: Automatic rollback on failure

---

**🎉 Your CI/CD pipeline is now ready!** Every push to main will automatically deploy your changes to AWS.