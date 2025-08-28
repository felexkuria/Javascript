# DynamoDB Migration Guide

This guide explains how to migrate from MongoDB to DynamoDB to resolve timeout issues and improve performance.

## 🎯 Why DynamoDB?

- **No Timeouts**: DynamoDB is serverless and highly available
- **Better Performance**: Single-digit millisecond latency
- **Auto Scaling**: Handles traffic spikes automatically
- **Cost Effective**: Pay only for what you use
- **AWS Integration**: Seamless integration with other AWS services

## 📋 Prerequisites

1. **AWS Account** with DynamoDB access
2. **AWS Credentials** configured
3. **Existing Data** in localStorage/MongoDB

## 🔧 Setup

### 1. Configure AWS Credentials

Add to your `.env` file:
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

### 2. Install Dependencies

AWS SDK is already included in the project dependencies.

## 🚀 Migration Process

### Option 1: Command Line Migration

```bash
# Navigate to backend directory
cd backend

# Run migration script
npm run migrate-dynamodb
```

### Option 2: API Migration

```bash
# Start the server
npm start

# Trigger migration via API
curl -X POST http://localhost:3000/api/dynamodb/migrate
```

### Option 3: Manual Migration

```javascript
const dynamoVideoService = require('./src/services/dynamoVideoService');

async function migrate() {
  const success = await dynamoVideoService.migrateToDatabase();
  console.log('Migration result:', success);
}

migrate();
```

## 📊 DynamoDB Tables

The migration creates these tables automatically:

### Videos Table
- **Partition Key**: `courseName` (String)
- **Sort Key**: `videoId` (String)
- **Attributes**: All video metadata

### Gamification Table
- **Partition Key**: `userId` (String)
- **Attributes**: User stats, achievements, streaks

### Users Table
- **Partition Key**: `email` (String)
- **Attributes**: User profile data

## 🔍 Verification

### Check Migration Status
```bash
curl http://localhost:3000/api/dynamodb/health
```

### Test Data Access
```bash
# Get all courses
curl http://localhost:3000/api/dynamodb/courses

# Get course videos
curl http://localhost:3000/api/dynamodb/courses/your-course-name/videos
```

## 🔄 Fallback Strategy

The system uses a **3-tier fallback**:

1. **DynamoDB** (Primary)
2. **MongoDB** (Secondary)
3. **localStorage** (Fallback)

If DynamoDB is unavailable, the system automatically falls back to MongoDB, then localStorage.

## 💰 Cost Estimation

DynamoDB pricing is based on:
- **Read/Write Capacity**: Pay per request
- **Storage**: $0.25 per GB per month
- **Typical Usage**: ~$5-20/month for small to medium apps

Use the [AWS Pricing Calculator](https://calculator.aws) for accurate estimates.

## 🛠️ Troubleshooting

### Common Issues

1. **AWS Credentials Not Found**
   ```bash
   Error: Missing credentials in config
   ```
   **Solution**: Check your `.env` file and AWS credentials

2. **Region Not Specified**
   ```bash
   Error: Missing region in config
   ```
   **Solution**: Set `AWS_REGION` in your `.env` file

3. **Permission Denied**
   ```bash
   Error: User is not authorized to perform: dynamodb:CreateTable
   ```
   **Solution**: Ensure your AWS user has DynamoDB permissions

### Debug Mode

Enable debug logging:
```bash
DEBUG=dynamodb* npm start
```

## 📈 Performance Benefits

After migration, you should see:
- ✅ **No more timeouts**
- ✅ **Faster page loads**
- ✅ **Better reliability**
- ✅ **Automatic scaling**

## 🔒 Security

DynamoDB provides:
- **Encryption at rest** (enabled by default)
- **Encryption in transit** (HTTPS)
- **IAM-based access control**
- **VPC endpoints** (optional)

## 📝 Monitoring

Monitor your DynamoDB usage:
1. **AWS CloudWatch** - Built-in metrics
2. **DynamoDB Console** - Real-time monitoring
3. **Application logs** - Custom logging

## 🔄 Rollback Plan

If you need to rollback:
1. **Keep localStorage files** as backup
2. **Export DynamoDB data** if needed
3. **Switch back** to MongoDB/localStorage mode

## 🎉 Next Steps

After successful migration:
1. **Monitor performance** for a few days
2. **Update monitoring alerts**
3. **Consider removing** MongoDB dependency
4. **Backup localStorage files** for safety

## 📞 Support

If you encounter issues:
1. Check the application logs
2. Verify AWS credentials and permissions
3. Test with the health check endpoint
4. Review the troubleshooting section above