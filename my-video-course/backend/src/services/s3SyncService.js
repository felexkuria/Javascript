const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const dynamodb = require('../utils/dynamodb');

class S3SyncService {
  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.bucketName = process.env.S3_BUCKET_NAME;
  }

  // Sync S3 videos to DynamoDB
  async syncS3ToDynamoDB() {
    try {
      if (!this.bucketName) {
        console.log('S3_BUCKET_NAME not configured, skipping sync');
        return 0;
      }

      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'videos/'
      });

      const s3Objects = await this.s3.send(command);
      const videoFiles = s3Objects.Contents?.filter(obj => 
        obj.Key.endsWith('.mp4') && obj.Key !== 'videos/'
      ) || [];

      for (const file of videoFiles) {
        const pathParts = file.Key.split('/');
        if (pathParts.length >= 3) {
          const courseName = pathParts[1];
          const fileName = pathParts[pathParts.length - 1];
          const title = fileName.replace('.mp4', '');
          
          const videoUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${file.Key}`;
          
          const videoData = {
            videoId: fileName.split('-')[0] || Date.now().toString(),
            courseName,
            title: title.split('-').slice(1).join(' ') || title,
            description: `Video: ${title}`,
            videoUrl,
            s3Key: file.Key,
            watched: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await dynamodb.saveVideo(videoData);
        }
      }

      console.log(`Synced ${videoFiles.length} videos from S3`);
      return videoFiles.length;
    } catch (error) {
      console.error('S3 sync error:', error.message);
      return 0;
    }
  }

  // Verify and repair course manifest links (Enhanced with Detailed Logs)
  async verifyManifest(courseName) {
    try {
      const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
      const COURSES_TABLE = `video-course-app-courses-${environment}`;
      const VIDEOS_TABLE = `video-course-app-videos-${environment}`;
      
      const logs = [`Initiating audit for ${courseName}...`];
      console.log(`🔍 Auditing manifest for ${courseName} on table: ${COURSES_TABLE}`);
      
      const courseResult = await dynamodb.docClient.send(new ScanCommand({
        TableName: COURSES_TABLE,
        FilterExpression: "courseName = :courseName",
        ExpressionAttributeValues: { ":courseName": courseName }
      }));

      const course = courseResult.Items?.[0];
      if (!course) return { success: false, message: 'Course not found', logs: ['Audit Failed: Course Node Not Found'] };

      let itemsRepaired = 0;
      let lastRepairedUrl = null;
      const sections = course.sections || [];
      
      logs.push("Scanning Architectural Nodes...");
      
      for (const section of sections) {
        for (const lecture of section.lectures || []) {
          if (lecture.type === 'video' || lecture.type === 'pdf') {
            const s3Key = (lecture.videoUrl || '').split('.com/')[1] || lecture.videoUrl;
            logs.push(`Handshaking node: ${lecture.title.substring(0, 20)}...`);
            
            const exists = await this.checkS3Exists(s3Key);
            
            if (!exists) {
              logs.push(`⚠️  S3_LINK_404: Node Offline`);
              logs.push(`Starting Recovery Sync for "${lecture.title}"...`);
              
              const recovery = await this.findRecoveryVideo(lecture.title, courseName);
              if (recovery) {
                const newUrl = `https://${this.bucketName}.s3.amazonaws.com/${recovery.s3Key}`;
                lecture.videoUrl = newUrl;
                lecture.url = newUrl;
                lecture.fullVideoUrl = newUrl;
                lecture.videoId = recovery.videoId;
                itemsRepaired++;
                lastRepairedUrl = newUrl;
                logs.push(`✅ Handshake Restored: Recovery Match [SUCCESS]`);
              } else {
                logs.push(`❌ Recovery Pulse Failed: No Match Found`);
              }
            } else {
              logs.push(`Handshake Valid [OK]`);
            }
          }
        }
      }

      if (itemsRepaired > 0) {
        logs.push(`Committing Repairs to DynamoDB...`);
        await dynamodb.docClient.send(new UpdateCommand({
          TableName: COURSES_TABLE,
          Key: { courseName: course.courseName },
          UpdateExpression: "SET sections = :sections, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":sections": sections,
            ":updatedAt": new Date().toISOString()
          }
        }));
        logs.push(`Final Handshake Successful: ${itemsRepaired} nodes restored.`);
      } else {
        logs.push(`Sync Complete: All nodes verified [OK].`);
      }

      return { 
        success: true, 
        repairedCount: itemsRepaired, 
        logs, 
        newUrl: lastRepairedUrl 
      };
    } catch (error) {
      console.error('Manifest verification error:', error);
      return { success: false, error: error.message, logs: [`ERROR: ${error.message}`] };
    }
  }
  
  // --- NEW (Senior Architect): Hybrid Local-S3 Discovery ---
  async getLocalFileMap() {
    if (process.env.LOCAL_DEV !== 'true') return {};
    const fs = require('fs');
    const path = require('path');
    const walk = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) results = results.concat(walk(file));
        else results.push(file);
      });
      return results;
    };

    try {
      const publicVideosPath = path.join(__dirname, '../../../frontend/public/videos');
      if (!fs.existsSync(publicVideosPath)) return {};
      
      const files = walk(publicVideosPath);
      const map = {};
      files.forEach(f => {
        const relativePath = f.split('public')[1].replace(/\\/g, '/');
        const fileName = f.split('/').pop();
        const slug = fileName.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "-");
        map[slug] = relativePath;
        
        // Also map by 13-digit prefix if exists
        const prefix = fileName.split('-')[0];
        if (prefix && prefix.length >= 10) map[prefix] = relativePath;
      });
      return map;
    } catch (error) {
      console.error('Local Map Discovery Failed:', error);
      return {};
    }
  }

  // --- NEW (Senior Architect): Physical Deep-S3 Discovery ---
  async getPhysicalS3Map() {
    try {
      const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const command = new ListObjectsV2Command({ Bucket: this.bucketName });
      const response = await this.s3.send(command).catch(() => ({ Contents: [] }));
      const map = {};
      
      (response.Contents || []).forEach(obj => {
        const fileName = obj.Key.split('/').pop();
        const prefix = fileName.split('-')[0];
        if (prefix && prefix.length >= 10) {
          map[prefix] = obj.Key;
        }
        const slug = fileName.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "-");
        map[slug] = obj.Key;
      });
      return map;
    } catch (error) {
      return {};
    }
  }
  
  // Verify and repair course manifest links (Enhanced with Hybrid Discovery)
  async verifyManifest(courseName) {
    try {
      const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
      const COURSES_TABLE = `video-course-app-courses-${environment}`;
      
      const logs = [`Initiating audit for ${courseName}...`];
      console.log(`🔍 Auditing manifest for ${courseName}`);
      
      const courseResult = await dynamodb.docClient.send(new ScanCommand({
        TableName: COURSES_TABLE,
        FilterExpression: "courseName = :courseName",
        ExpressionAttributeValues: { ":courseName": courseName }
      }));
  
      const course = courseResult.Items?.[0];
      if (!course) return { success: false, message: 'Course not found', logs: ['Audit Failed: Course Node Not Found'] };
  
      let itemsRepaired = 0;
      let lastRepairedUrl = null;
      const sections = course.sections || [];
      
      logs.push("Synchronizing Physical Asset Registry...");
      const physicalMap = await this.getPhysicalS3Map();
      const localMap = await this.getLocalFileMap();
      
      for (const section of sections) {
        for (const lecture of section.lectures || []) {
          if (lecture.type === 'video' || lecture.type === 'pdf') {
            const currentUrl = lecture.videoUrl || lecture.url || '';
            const s3Key = currentUrl.includes('.com/') ? currentUrl.split('.com/')[1] : currentUrl;
            
            logs.push(`Handshaking node: ${lecture.title.substring(0, 20)}...`);
            const exists = await this.checkS3Existss(s3Key);
            
            if (!exists) {
              logs.push(`⚠️  S3_LINK_404: Node Offline`);
              logs.push(`Starting Recovery Discovery for "${lecture.title}"...`);
              
              const titleSlug = lecture.title.toLowerCase().replace(/[^a-z0-9]/g, "-");
              const prefix = (lecture.videoId || '').toString().substring(0, 10);
              
              // 🧪 STRATEGY A: Prefix Match (Physical S3)
              let foundKey = physicalMap[prefix] || physicalMap[titleSlug];
              
              if (foundKey) {
                const newUrl = `https://${this.bucketName}.s3.amazonaws.com/${foundKey}`;
                lecture.videoUrl = newUrl;
                lecture.url = newUrl;
                lecture.fullVideoUrl = newUrl;
                lecture.s3Key = foundKey;
                itemsRepaired++;
                lastRepairedUrl = newUrl;
                logs.push(`✅ S3 MATCH: ${foundKey.substring(0, 30)}... [RESTORED]`);
              } else {
                // 🧪 STRATEGY B: Local Fallback
                const localPath = localMap[prefix] || localMap[titleSlug];
                if (localPath) {
                  lecture.videoUrl = localPath;
                  lecture.url = localPath;
                  lecture.fullVideoUrl = localPath;
                  lecture.s3Key = `local://${localPath}`;
                  itemsRepaired++;
                  lastRepairedUrl = localPath;
                  logs.push(`✅ LOCAL MATCH: ${lecture.title} [RECOVERED]`);
                } else {
                  logs.push(`❌ Recovery Pulse Failed: No Asset Found`);
                }
              }
            } else {
              logs.push(`Handshake Valid [OK]`);
            }
          }
        }
      }
  
      if (itemsRepaired > 0) {
        logs.push(`Committing Repairs to DynamoDB...`);
        await dynamodb.docClient.send(new UpdateCommand({
          TableName: COURSES_TABLE,
          Key: { courseName: course.courseName },
          UpdateExpression: "SET sections = :sections, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":sections": sections,
            ":updatedAt": new Date().toISOString()
          }
        }));
        logs.push(`Final Handshake Successful: ${itemsRepaired} nodes restored.`);
      } else {
        logs.push(`Sync Complete: All nodes verified [OK].`);
      }
  
      return { success: true, repairedCount: itemsRepaired, logs, newUrl: lastRepairedUrl };
    } catch (error) {
      console.error('Manifest verification error:', error);
      return { success: false, error: error.message, logs: [`ERROR: ${error.message}`] };
    }
  }
  
  async checkS3Existss(key) {
    if (!key || key === 'undefined' || key === 'null') return false;
    if (key.startsWith('/') || key.startsWith('local://')) return true; // Local path assumption
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: key }));
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new S3SyncService();