const express = require('express');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { TranscribeClient, StartTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const transcribeClient = new TranscribeClient({ region: process.env.AWS_REGION || 'us-east-1' });

app.post('/generate-captions', async (req, res) => {
  try {
    const { videoUrl, courseName, videoTitle, s3Bucket } = req.body;
    
    // Check video duration first
    const duration = await getVideoDuration(videoUrl);
    
    if (duration <= 3600) { // 1 hour or less - use Whisper
      processWithWhisper(videoUrl, courseName, videoTitle, s3Bucket);
    } else { // Over 1 hour - use Transcribe
      processWithTranscribe(videoUrl, courseName, videoTitle, s3Bucket);
    }
    
    res.json({ success: true, method: duration <= 3600 ? 'whisper' : 'transcribe' });
  } catch (error) {
    console.error('Caption generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function getVideoDuration(videoUrl) {
  return new Promise((resolve, reject) => {
    exec(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoUrl}"`, (error, stdout) => {
      if (error) reject(error);
      else resolve(parseFloat(stdout.trim()));
    });
  });
}

async function processWithWhisper(videoUrl, courseName, videoTitle, s3Bucket) {
  const tempDir = '/tmp';
  const videoFile = path.join(tempDir, `${Date.now()}.mp4`);
  const audioFile = path.join(tempDir, `${Date.now()}.wav`);
  const srtFile = path.join(tempDir, `${Date.now()}.srt`);
  
  try {
    // Download video
    exec(`wget -O "${videoFile}" "${videoUrl}"`, (error) => {
      if (error) throw error;
      
      // Extract audio
      exec(`ffmpeg -i "${videoFile}" -ar 16000 -ac 1 "${audioFile}"`, (error) => {
        if (error) throw error;
        
        // Generate SRT with Whisper
        exec(`whisper "${audioFile}" --model base --output_format srt --output_dir "${tempDir}"`, async (error) => {
          if (error) throw error;
          
          // Read and improve SRT with AI
          const rawSrtContent = fs.readFileSync(srtFile, 'utf8');
          
          try {
            const aiService = require('./services/aiService');
            const improvedSrt = await aiService.generateCaptionsFromSRT(rawSrtContent, videoTitle);
            const summary = await aiService.summarizeFromSRT(rawSrtContent, videoTitle);
            
            // Upload improved SRT to S3
            await s3Client.send(new PutObjectCommand({
              Bucket: s3Bucket,
              Key: `captions/${courseName}/${videoTitle}.srt`,
              Body: improvedSrt,
              ContentType: 'text/plain'
            }));
            
            // Upload summary as metadata
            await s3Client.send(new PutObjectCommand({
              Bucket: s3Bucket,
              Key: `summaries/${courseName}/${videoTitle}.txt`,
              Body: summary,
              ContentType: 'text/plain'
            }));
            
            console.log(`AI-improved SRT and summary generated for ${courseName}/${videoTitle}`);
          } catch (aiError) {
            console.error('AI processing failed, using raw SRT:', aiError);
            
            // Upload raw SRT as fallback
            await s3Client.send(new PutObjectCommand({
              Bucket: s3Bucket,
              Key: `captions/${courseName}/${videoTitle}.srt`,
              Body: rawSrtContent,
              ContentType: 'text/plain'
            }));
          }
          
          // Cleanup
          fs.unlinkSync(videoFile);
          fs.unlinkSync(audioFile);
          fs.unlinkSync(srtFile);
        });
      });
    });
  } catch (error) {
    console.error('Whisper processing error:', error);
  }
}

async function processWithTranscribe(videoUrl, courseName, videoTitle, s3Bucket) {
  const jobName = `${courseName}-${videoTitle}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '-');
  
  await transcribeClient.send(new StartTranscriptionJobCommand({
    TranscriptionJobName: jobName,
    Media: { MediaFileUri: videoUrl },
    MediaFormat: 'mp4',
    LanguageCode: 'en-US',
    OutputBucketName: s3Bucket,
    Subtitles: { Formats: ['srt'] }
  }));
  
  console.log(`Transcribe job started for ${courseName}/${videoTitle}`);
}

app.listen(8081, () => {
  console.log('Caption service running on port 8081');
});