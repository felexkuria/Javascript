# 🔬 QA Integration Test Suite

This directory contains the automated integration tests for the Video Course Platform's AWS infrastructure. These tests are executed as a **Production Gate** in the CI/CD pipeline.

## 🏗️ Architecture
The test suite uses **Pytest + Boto3** to validate the end-to-end functionality of the system:
- **S3**: Validates upload/retrieve, public access blocking, CORS, and encryption.
- **DynamoDB**: Validates CRUD operations, GSI health, and conditional writes.
- **Route 53 & TLS**: Validates DNS resolution, HTTPS reachability, and SSL certificate validity.
- **Infrastructure State**: Uses Boto3 to assert that all expected Terraform resources actually exist.

## 🚀 Running Tests Locally

### 1. Prerequisites
- Python 3.10+
- AWS Credentials configured with sufficient permissions.
- Environment variables set (see below).

### 2. Install Dependencies
```bash
pip install -r tests/integration/requirements.txt
```

### 3. Set Environment Variables
Required for local execution:
```bash
export AWS_DEFAULT_REGION="us-east-1"
export APP_S3_BUCKET="your-staging-bucket-name"
export APP_DYNAMODB_TABLE="video-course-app-videos-staging"
export APP_DOMAIN="skool.yourdomain.com"
export APP_NAME="video-course-app"
export APP_ENVIRONMENT="staging"
```

### 4. Execute Tests
```bash
pytest tests/integration/ -v
```

## 🛡️ The Production Gate
The CI/CD pipeline (`.github/workflows/deploy-and-test.yml`) follows this logic:
1. **Deploy to Staging**: Terraform provisions/updates the staging environment.
2. **QA Suite**: This test suite runs against the staging environment.
3. **The Gate**: 
   - If **ANY** test fails, the pipeline halts immediately.
   - An email alert is sent to **engineerfelex@gmail.com**.
   - The production deployment is **BLOCKED**.
4. **Deploy to Production**: Only if all tests pass, the changes are promoted to production.

> [!IMPORTANT]
> Ensure the following GitHub Secrets are configured for the new pipeline:
> - `SMTP_SERVER` (e.g., `smtp.gmail.com`)
> - `SMTP_PORT` (e.g., `465` or `587`)
> - `SMTP_USERNAME`
> - `SMTP_PASSWORD`
> - `MAIL_FROM`
> - `GEMINI_API_KEY`
> - `NOVA_API_KEY`

## 🧹 Cleanup
All tests use a session-scoped `qa_prefix` (e.g., `qa-abc12345-1711900000`). 
- **S3**: Any objects created with this prefix are deleted after the run.
- **DynamoDB**: Any items created with this prefix are deleted after the run.
No test data survives the CI/CD run.
