const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const transcribe = new AWS.TranscribeService();

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    for (const record of event.Records) {
        if (record.eventName.startsWith('ObjectCreated')) {
            const bucket = record.s3.bucket.name;
            const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
            
            console.log(`Processing video: ${key}`);
            
            // Extract course name and video info from S3 key
            const pathParts = key.split('/');
            if (pathParts.length >= 3 && pathParts[0] === 'videos') {
                const courseName = pathParts[1];
                const videoFileName = pathParts[pathParts.length - 1];
                const videoId = videoFileName.replace('.mp4', '');
                
                // Create video metadata in DynamoDB
                const videoData = {
                    courseName: courseName,
                    videoId: videoId,
                    title: videoId.replace(/_/g, ' '),
                    s3Key: key,
                    videoUrl: `https://${bucket}.s3.amazonaws.com/${key}`,
                    createdAt: new Date().toISOString(),
                    transcriptionStatus: 'pending'
                };
                
                try {
                    // Save to DynamoDB
                    await dynamodb.put({
                        TableName: '${dynamodb_table}',
                        Item: videoData
                    }).promise();
                    
                    console.log(`Video metadata saved for ${videoId}`);
                    
                    // Start transcription job
                    const transcriptionJobName = `${courseName}-${videoId}-${Date.now()}`;
                    
                    await transcribe.startTranscriptionJob({
                        TranscriptionJobName: transcriptionJobName,
                        LanguageCode: 'en-US',
                        Media: {
                            MediaFileUri: `s3://${bucket}/${key}`
                        },
                        OutputBucketName: bucket,
                        OutputKey: `transcripts/${courseName}/${videoId}.json`,
                        Settings: {
                            ShowSpeakerLabels: true,
                            MaxSpeakerLabels: 2
                        }
                    }).promise();
                    
                    console.log(`Transcription job started: ${transcriptionJobName}`);
                    
                    // Update DynamoDB with transcription job name
                    await dynamodb.update({
                        TableName: '${dynamodb_table}',
                        Key: {
                            courseName: courseName,
                            videoId: videoId
                        },
                        UpdateExpression: 'SET transcriptionJobName = :jobName, transcriptionStatus = :status',
                        ExpressionAttributeValues: {
                            ':jobName': transcriptionJobName,
                            ':status': 'processing'
                        }
                    }).promise();
                    
                } catch (error) {
                    console.error('Error processing video:', error);
                }
            }
        }
    }
    
    return { statusCode: 200, body: 'Processing complete' };
};