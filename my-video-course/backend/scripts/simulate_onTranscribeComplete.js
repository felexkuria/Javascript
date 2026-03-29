const Module = require('module');
const path = require('path');
const originalRequire = Module.prototype.require;

// --- 🌐 SIMULATION ENV SETUP ---
process.env.S3_BUCKET_NAME = 'project-levi-curriculum-prod';
process.env.AWS_REGION = 'us-east-1';

// --- 🎭 MOCKING HARNESS ---
const mocks = {
  '@aws-sdk/client-transcribe': {
    TranscribeClient: class { send() { return { TranscriptionJob: { Subtitles: { SubtitleFileUris: ['https://example.com/test.srt'] } } }; } },
    GetTranscriptionJobCommand: class { constructor(p) { this.p = p; } }
  },
  '@aws-sdk/client-s3': {
    S3Client: class { send(cmd) { console.log('   📤 S3: Storing processed SRT...', cmd.p.Key); return {}; } },
    PutObjectCommand: class { constructor(p) { this.p = p; } }
  },
  '../services/srtQuizGenerator': {
    parseSRT: () => [{ timestamp: '00:00:01,000', text: 'Hello World' }],
    generateAIQuestions: async () => [{ id: 'q1', question: 'Success?', answer: 'Yes' }],
    generateSummaryAndTopics: async () => ({ summary: 'Simulation successful.', topics: ['Test'] })
  },
  '../services/dynamoVideoService': {
    getVideosForCourse: async () => [{ _id: 'vid_123', title: 'Terraform Certification', courseName: 'Course' }],
    updateVideo: async (course, id, updates) => {
        console.log('   📦 DB: Updating Video Node...', { course, id, updates });
        return true;
    }
  },
  'https': {
    get: (url, callback) => {
      const res = { on: (evt, cb) => { 
        if (evt === 'data') cb('1\n00:00:01,000 --> 00:00:10,000\nHello World\n');
        if (evt === 'end') cb();
      }};
      callback(res);
      return { on: (evt, cb) => {} };
    }
  }
};

// --- 🛠️ INJECT MOCKS ---
Module.prototype.require = function(pathStr) {
  if (mocks[pathStr]) return mocks[pathStr];
  return originalRequire.apply(this, arguments);
};

// --- 🎬 EXECUTE SIMULATION ---
const { handler } = require('../src/lambdas/onTranscribeComplete');

console.log(`\n🛰️  LAMBDA SIMULATION INITIATED: onTranscribeComplete...\n`);

const testEvent = {
  detail: {
    TranscriptionJobName: 'Job-Terraform-Certification-1774742262056',
    TranscriptionJobStatus: 'COMPLETED'
  }
};

async function run() {
  try {
    const result = await handler(testEvent);
    console.log(`\n✨ SIMULATION FINISHED:`, result);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ SIMULATION FAILED:`, err);
    process.exit(1);
  }
}

run();
