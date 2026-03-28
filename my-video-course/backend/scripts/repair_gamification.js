const { DynamoDBClient, ScanCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENV = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

const client = new DynamoDBClient({ region: REGION });

async function repairGamification() {
  const table = `video-course-app-gamification-${ENV}`;
  console.log(`\n🏥 REPAIR SEQUENCE INITIATED: ${table}...\n`);

  try {
    const scanResult = await client.send(new ScanCommand({ TableName: table }));
    const items = scanResult.Items || [];

    for (const marshalledItem of items) {
      const item = unmarshall(marshalledItem);
      console.log(`\n👤 Inspecting User: ${item.userId}`);

      // 1. Identify "Watched" videos - Handle both flat/counter and nested/map
      console.log(`   🔍 Item Keys: ${Object.keys(item).join(', ')}`);
      const vWatchedRaw = item.userStats?.videosWatched || item.videosWatched;
      console.log(`   🔍 rawValue: ${vWatchedRaw} (Type: ${typeof vWatchedRaw})`);
      
      let watchedCount = 0;
      let videosWatchedMap = {};

      if (typeof vWatchedRaw === 'number' && !isNaN(vWatchedRaw)) {
        watchedCount = vWatchedRaw;
        videosWatchedMap = {}; 
      } else if (typeof vWatchedRaw === 'object' && vWatchedRaw !== null) {
        videosWatchedMap = vWatchedRaw;
        watchedCount = Object.keys(vWatchedRaw).length;
      }



      // 2. Recalculate Points (10 per video + achievement bonuses)
      let calculatedPoints = watchedCount * 10;
      const achievements = item.achievements || [];
      const stats = item.userStats || item;

      // Achievement points logic (matches videoController.js)
      if (watchedCount >= 1 && !achievements.find(a => a.id === 'getting-started')) {
        achievements.push({ id: 'getting-started', title: 'Getting Started', points: 10, unlockedAt: new Date().toISOString() });
        calculatedPoints += 10;
      }
      if (watchedCount >= 5 && !achievements.find(a => a.id === 'video-enthusiast')) {
        achievements.push({ id: 'video-enthusiast', title: 'Video Enthusiast', points: 25, unlockedAt: new Date().toISOString() });
        calculatedPoints += 25;
      }

      // 3. Normalize into the "Premium" Nested Structure
      const repairedItem = {
        userId: item.userId,
        userStats: {
          totalPoints: calculatedPoints,
          videosWatched: videosWatchedMap,
          experiencePoints: stats.experiencePoints || 0,
          currentLevel: stats.currentLevel || 1,
          coursesCompleted: stats.coursesCompleted || 0,
          quizzesTaken: stats.quizzesTaken || 0,
          perfectQuizzes: stats.perfectQuizzes || 0,
          studyDays: stats.studyDays || 0
        },
        achievements: achievements,
        streakData: item.streakData || { currentStreak: 0, longestStreak: 0, lastActivity: new Date().toISOString() },
        updatedAt: new Date().toISOString()
      };

      // 4. Update the item with Cleanup (REMOVE flat attributes)
      const { UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
      
      const updateParams = {
        TableName: table,
        Key: marshalledItem.userId ? { userId: marshalledItem.userId } : { userId: { S: item.userId } },
        UpdateExpression: "SET userStats = :us, achievements = :ach, streakData = :sd, updatedAt = :ua REMOVE totalPoints, videosWatched, experiencePoints, currentLevel, coursesCompleted, quizzesTaken, perfectQuizzes, studyDays, #l, #s, badges, #la, #str",
        ExpressionAttributeNames: {
          "#l": "level",
          "#s": "stats",
          "#la": "lastActivity",
          "#str": "streak"
        },
        ExpressionAttributeValues: marshall({
          ":us": repairedItem.userStats,
          ":ach": repairedItem.achievements,
          ":sd": repairedItem.streakData,
          ":ua": repairedItem.updatedAt
        })
      };


      await client.send(new UpdateItemCommand(updateParams));

      console.log(`   ✅ Corrected: Found ${watchedCount} watches. Assigned ${calculatedPoints} points.`);
      console.log(`   🏗️  Schema: Cleaned Flat Attributes & Normalized Nested Object.`);

    }

    console.log(`\n✨ REPAIR COMPLETE. ALL RECORDS NORMALIZED.`);
  } catch (error) {
    console.error(`❌ Repair failed:`, error.message);
  }
}

repairGamification();
