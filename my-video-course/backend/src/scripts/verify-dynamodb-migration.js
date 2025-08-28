const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function verifyMigration() {
    try {
        console.log('=== Verifying HashiCorp Course Migration ===\n');
        
        // Check courses table
        console.log('1. Checking courses table...');
        const coursesResult = await docClient.send(new ScanCommand({
            TableName: 'video-course-courses-dev'
        }));
        
        console.log(`Total courses in DynamoDB: ${coursesResult.Items.length}`);
        
        const hashiCourse = coursesResult.Items.find(course => 
            course.courseName && typeof course.courseName === 'string' && course.courseName.includes('HashiCorp')
        );
        
        if (hashiCourse) {
            console.log('✅ HashiCorp course found in courses table:');
            console.log(`   Course Name: ${hashiCourse.courseName}`);
            console.log(`   Title: ${hashiCourse.title}`);
            console.log(`   Total Videos: ${hashiCourse.totalVideos}`);
            console.log(`   User ID: ${hashiCourse.userId}`);
        } else {
            console.log('❌ HashiCorp course NOT found in courses table');
        }
        
        // Check videos table
        console.log('\n2. Checking videos table...');
        const videosResult = await docClient.send(new ScanCommand({
            TableName: 'video-course-videos-dev'
        }));
        
        console.log(`Total videos in DynamoDB: ${videosResult.Items.length}`);
        
        const hashiVideos = videosResult.Items.filter(video => 
            video.courseName && typeof video.courseName === 'string' && video.courseName.includes('HashiCorp')
        );
        
        console.log(`HashiCorp videos found: ${hashiVideos.length}`);
        
        if (hashiVideos.length > 0) {
            console.log('✅ HashiCorp videos found in videos table');
            console.log(`   Sample video: ${hashiVideos[0].title}`);
            console.log(`   Course Name: ${hashiVideos[0].courseName}`);
            console.log(`   User ID: ${hashiVideos[0].userId}`);
            
            // Check for different users
            const userIds = [...new Set(hashiVideos.map(v => v.userId))];
            console.log(`   User IDs with HashiCorp videos: ${userIds.join(', ')}`);
        } else {
            console.log('❌ No HashiCorp videos found in videos table');
        }
        
        // Check progress table
        console.log('\n3. Checking progress table...');
        const progressResult = await docClient.send(new ScanCommand({
            TableName: 'video-course-progress-dev'
        }));
        
        console.log(`Total progress records in DynamoDB: ${progressResult.Items.length}`);
        
        const hashiProgress = progressResult.Items.filter(progress => 
            progress.courseName && typeof progress.courseName === 'string' && progress.courseName.includes('HashiCorp')
        );
        
        console.log(`HashiCorp progress records: ${hashiProgress.length}`);
        
        if (hashiProgress.length > 0) {
            console.log('✅ HashiCorp progress data found');
            console.log(`   Sample progress: ${hashiProgress[0].videoId} - watched: ${hashiProgress[0].watched}`);
        } else {
            console.log('⚠️  No HashiCorp progress data found (expected for fresh migration)');
        }
        
        // Summary
        console.log('\n=== Migration Summary ===');
        console.log(`Course migrated: ${hashiCourse ? '✅ Yes' : '❌ No'}`);
        console.log(`Videos migrated: ${hashiVideos.length > 0 ? `✅ Yes (${hashiVideos.length} videos)` : '❌ No'}`);
        console.log(`Progress synced: ${hashiProgress.length > 0 ? `✅ Yes (${hashiProgress.length} records)` : '⚠️  No progress data (fresh course)'}`);
        
        if (hashiCourse && hashiVideos.length > 0) {
            console.log('\n🎉 HashiCorp course successfully migrated to DynamoDB!');
            console.log('The course should now appear in the course list.');
        } else {
            console.log('\n❌ Migration incomplete. Course may not appear in the list.');
        }
        
    } catch (error) {
        console.error('Verification error:', error);
    }
}

verifyMigration();