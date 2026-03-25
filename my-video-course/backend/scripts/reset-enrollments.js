const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const environment = process.env.NODE_ENV || 'dev';
const coursesTable = `video-course-app-courses-${environment}`;
const enrollmentsTable = `video-course-app-enrollments-${environment}`;

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);

async function resetEnrollments() {
    console.log(`🚀 Resetting enrollments in tables: ${coursesTable}, ${enrollmentsTable}`);
    
    try {
        // 1. Reset counts in Courses table
        const scanResultCour = await docClient.send(new ScanCommand({ TableName: coursesTable }));
        const courses = scanResultCour.Items || [];
        console.log(`Found ${courses.length} courses to reset.`);

        for (const course of courses) {
            console.log(`Resetting: ${course.title || course.name} (Key: ${course.courseName})`);
            await docClient.send(new UpdateCommand({
                TableName: coursesTable,
                Key: { courseName: course.courseName },
                UpdateExpression: 'SET enrollments = :zero',
                ExpressionAttributeValues: { ':zero': 0 }
            }));
        }

        // 2. Clear Enrollments table
        const scanResultEnr = await docClient.send(new ScanCommand({ TableName: enrollmentsTable }));
        const enrollments = scanResultEnr.Items || [];
        console.log(`Found ${enrollments.length} enrollment records to purge.`);
        if (enrollments.length > 0) {
            console.log('Sample enrollment keys:', Object.keys(enrollments[0]));
            console.log('Sample enrollment:', JSON.stringify(enrollments[0]));
        }

        const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
        for (const enr of enrollments) {
            console.log(`Deleting enrollment: User ${enr.userId} -> Course ${enr.courseName}`);
            await docClient.send(new DeleteCommand({
                TableName: enrollmentsTable,
                Key: { 
                    userId: enr.userId,
                    courseName: enr.courseName
                }
            }));
        }

        console.log('✅ All course enrollments reset and records purged.');
    } catch (error) {
        console.error('❌ Reset failed:', error.message);
    }
}

resetEnrollments();
