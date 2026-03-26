const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const COURSES_TABLE = `video-course-app-courses-${environment}`;
const ENROLLMENTS_TABLE = `video-course-app-enrollments-${environment}`;

async function resetEnrollments() {
  try {
    console.log(`🚀 Resetting enrollments for environment: ${environment}`);

    // 1. Reset all course enrollment counts to 0
    const coursesScan = await docClient.send(new ScanCommand({ TableName: COURSES_TABLE }));
    const courses = coursesScan.Items || [];
    
    for (const course of courses) {
      await docClient.send(new UpdateCommand({
        TableName: COURSES_TABLE,
        Key: { courseName: course.courseName || course.name },
        UpdateExpression: "SET enrollments = :zero",
        ExpressionAttributeValues: { ":zero": 0 }
      }));
      console.log(`✅ Reset course: ${course.name}`);
    }

    // 2. Clear all entries in the enrollments table
    const enrollmentsScan = await docClient.send(new ScanCommand({ TableName: ENROLLMENTS_TABLE }));
    const enrollments = enrollmentsScan.Items || [];
    
    for (const enr of enrollments) {
      await docClient.send(new DeleteCommand({
        TableName: ENROLLMENTS_TABLE,
        Key: { 
          userId: enr.userId,
          courseName: enr.courseName
        }
      }));
      console.log(`🗑️ Deleted enrollment: ${enr.userId} -> ${enr.courseName}`);
    }

    console.log("✨ All enrollments reset successfully!");
  } catch (err) {
    console.error("❌ Reset failed:", err.message);
  }
}

resetEnrollments();
