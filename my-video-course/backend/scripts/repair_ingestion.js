const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);

async function repair() {
    const s3Key = "videos/aws_ai-ml_-dev/1774937451574-lesson_1.mp4";
    const bucket = "video-course-app-video-bucket-prod-6m5k2til";
    // Construct the expected thumbnail path
    const thumbKey = "thumbnails/aws_ai-ml_-dev/1774937451574-lesson_1.jpg";
    const thumbUrl = `https://${bucket}.s3.amazonaws.com/${thumbKey}`;
    
    console.log(`Searching for record with s3Key: ${s3Key}`);
    
    const scanRes = await ddb.send(new ScanCommand({
        TableName: "video-course-app-videos-dev",
        FilterExpression: "s3Key = :k",
        ExpressionAttributeValues: { ":k": s3Key }
    }));
    
    if (scanRes.Items && scanRes.Items.length > 0) {
        const item = scanRes.Items[0];
        console.log(`Found item: ${item.videoId} in course: ${item.courseName}. Updating to ONLINE with thumbnail...`);
        
        await ddb.send(new UpdateCommand({
            TableName: "video-course-app-videos-dev",
            Key: { 
                courseName: item.courseName,
                videoId: item.videoId 
            },
            UpdateExpression: "SET thumbnailUrl = :t, #s = :online",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
                ":t": thumbUrl,
                ":online": "ONLINE"
            }
        }));
        
        console.log("✅ Repair synchronization complete.");
    } else {
        console.log("❌ No record found in DynamoDB to repair.");
    }
}

repair().catch(console.error);
