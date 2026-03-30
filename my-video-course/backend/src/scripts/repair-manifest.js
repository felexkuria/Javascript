#!/usr/bin/env node
/**
 * 🛠️ Manifest Repair Script (Google Cloud-Grade Reliability)
 * Audits and fixes synchronization gaps between DynamoDB Course Manifest and S3 Storage.
 */

const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const path = require('path');

// Initialize AWS Clients
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const BUCKET_NAME = 'video-course-app-video-bucket-prod-6m5k2til';
const COURSES_TABLE = 'video-course-app-courses-prod';
const VIDEOS_TABLE = 'video-course-app-videos-prod';

const DRY_RUN = process.argv.includes('--dry-run');

async function repairManifest() {
    console.log(`\n🚀 Starting Manifest Repair Audit [${DRY_RUN ? 'DRY RUN' : 'LIVE REPAIR'}]`);
    console.log(`📊 Table: ${COURSES_TABLE}\n`);

    try {
        // 1. Fetch all courses
        const result = await docClient.send(new ScanCommand({ TableName: COURSES_TABLE }));
        const courses = result.Items || [];

        for (const course of courses) {
            console.log(`\n📚 Auditing Course: ${course.courseName}`);
            let courseUpdated = false;
            const updatedSections = [...(course.sections || [])];

            for (let sIdx = 0; sIdx < updatedSections.length; sIdx++) {
                const section = updatedSections[sIdx];
                const lectures = section.lectures || [];

                for (let lIdx = 0; lIdx < lectures.length; lIdx++) {
                    const lecture = lectures[lIdx];
                    if (lecture.type !== 'video') continue;

                    const videoUrl = lecture.videoUrl || lecture.url || '';
                    if (!videoUrl) {
                        console.warn(`  ⚠️ Missing URL: [${lecture.title}] (ID: ${lecture._id})`);
                        continue;
                    }

                    // Extract S3 Key from URL
                    let s3Key = '';
                    if (videoUrl.includes('amazonaws.com')) {
                        s3Key = videoUrl.split('.com/')[1];
                    } else {
                        s3Key = videoUrl;
                    }

                    // 2. Validate S3 Asset existence
                    const exists = await checkS3Exists(s3Key);
                    if (!exists) {
                        console.error(`  ❌ 404_MISSING: [${lecture.title}] -> S3 Key: ${s3Key}`);
                        
                        // 3. Attempt recovery from VIDEOS table (populated by S3 sync)
                        const recoveryData = await findRecoveryVideo(lecture.title, course.courseName);
                        if (recoveryData) {
                            console.log(`  ✨ RECOVERY FOUND: [${lecture.title}] -> New Key: ${recoveryData.s3Key}`);
                            const newUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${recoveryData.s3Key}`;
                            lecture.videoUrl = newUrl;
                            lecture.url = newUrl;
                            lecture.fullVideoUrl = newUrl;
                            lecture.videoId = recoveryData.videoId;
                            courseUpdated = true;
                        } else {
                            console.error(`  💀 NO RECOVERY: Leaving as is (or could flag as OFFLINE)`);
                        }
                    } else {
                        // console.log(`  ✅ OK: [${lecture.title}]`);
                    }
                }
            }

            // 4. Update Course Record if changed
            if (courseUpdated && !DRY_RUN) {
                await updateCourseManifest(course.courseName, updatedSections);
                console.log(`  💾 Saved repairs for course: ${course.courseName}`);
            } else if (courseUpdated) {
                console.log(`  ⏭️  Dry run: Would have saved repairs for course: ${course.courseName}`);
            }
        }

        console.log(`\n✅ Audit/Repair completed successfully.`);

    } catch (error) {
        console.error(`❌ Critical failure:`, error.message);
    }
}

async function checkS3Exists(key) {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        }));
        return true;
    } catch (error) {
        return false;
    }
}

async function findRecoveryVideo(title, courseName) {
    try {
        // Try to find a video in the VIDEOS table with a similar title
        // Note: Titles might be cleaned, so we'll use a scan (inefficient but this is a one-time repair)
        const result = await docClient.send(new ScanCommand({
            TableName: VIDEOS_TABLE,
            FilterExpression: "courseName = :courseName AND contains(title, :title)",
            ExpressionAttributeValues: {
                ":courseName": courseName,
                ":title": title.trim()
            }
        }));

        if (result.Items && result.Items.length > 0) {
            return result.Items[0];
        }
        
        // Try fallback with fuzzy title (partial match)
        const shortTitle = title.split(' ')[0];
        if (shortTitle.length > 3) {
            const fuzzyResult = await docClient.send(new ScanCommand({
                TableName: VIDEOS_TABLE,
                FilterExpression: "courseName = :courseName AND contains(title, :title)",
                ExpressionAttributeValues: {
                    ":courseName": courseName,
                    ":title": shortTitle
                }
            }));
            if (fuzzyResult.Items && fuzzyResult.Items.length > 0) {
                return fuzzyResult.Items[0];
            }
        }

        return null;
    } catch (error) {
        return null;
    }
}

async function updateCourseManifest(courseName, sections) {
    const params = {
        TableName: COURSES_TABLE,
        Key: { courseName: courseName },
        UpdateExpression: "SET sections = :sections, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
            ":sections": sections,
            ":updatedAt": new Date().toISOString()
        }
    };
    await docClient.send(new UpdateCommand(params));
}

repairManifest();
