const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);

async function run() {
  const table = "video-course-app-videos-prod";
  const courseName = "aws_ai-ml_-dev";
  const videoId = "1774939840635";
  const s3Key = `videos/${courseName}/${videoId}-lesson_1.mp4`;
  const bucket = "video-course-app-video-bucket-prod-6m5k2til";
  
  const videoData = {
    courseName: courseName,
    videoId: videoId,
    title: "Lesson 1 (Restored)",
    videoUrl: `https://${bucket}.s3.amazonaws.com/${s3Key}`,
    thumbnailUrl: `https://${bucket}.s3.amazonaws.com/thumbnails/${courseName}/${videoId}-lesson_1.jpg`,
    s3Key: s3Key,
    status: "ONLINE",
    watched: false,
    processing: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await ddb.send(new PutCommand({
      TableName: table,
      Item: videoData
    }));
    console.log("✅ Manual restoration of video 1774939840635 complete.");
  } catch (err) {
    console.error("❌ Failed to restore record:", err);
  }
}

run();
