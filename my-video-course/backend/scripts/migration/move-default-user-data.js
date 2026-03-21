const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

async function moveDefaultUserData() {
    const tables = [
        'video-course-videos-dev',
        'video-course-gamification-dev',
        'video-course-users-dev'
    ];

    for (const tableName of tables) {
        try {
            console.log(`Processing table: ${tableName}`);
            
            // Scan for default user data
            const scanParams = {
                TableName: tableName,
                FilterExpression: 'userId = :defaultUser',
                ExpressionAttributeValues: {
                    ':defaultUser': 'default'
                }
            };

            const result = await dynamodb.send(new ScanCommand(scanParams));
            
            if (result.Items.length === 0) {
                console.log(`No default user data found in ${tableName}`);
                continue;
            }

            // Move each item to engineerfelex@gmail.com
            for (const item of result.Items) {
                // Create new item with engineerfelex@gmail.com as userId
                const newItem = {
                    ...item,
                    userId: 'engineerfelex@gmail.com'
                };

                // Put new item
                await dynamodb.send(new PutCommand({
                    TableName: tableName,
                    Item: newItem
                }));

                // Delete old item
                const deleteKey = {};
                if (item.userId && item.videoId) {
                    deleteKey.userId = 'default';
                    deleteKey.videoId = item.videoId;
                } else if (item.userId && item.courseName) {
                    deleteKey.userId = 'default';
                    deleteKey.courseName = item.courseName;
                } else if (item.userId) {
                    deleteKey.userId = 'default';
                }

                if (Object.keys(deleteKey).length > 0) {
                    await dynamodb.send(new DeleteCommand({
                        TableName: tableName,
                        Key: deleteKey
                    }));
                }

                console.log(`Moved item from default to engineerfelex@gmail.com in ${tableName}`);
            }

        } catch (error) {
            console.error(`Error processing ${tableName}:`, error);
        }
    }

    console.log('Migration completed!');
}

moveDefaultUserData().catch(console.error);