const { withRetry } = require('./backend/src/utils/retry');

async function test() {
  let attempts = 0;
  console.log('🚀 Starting Retry with Jitter test...');
  
  try {
    await withRetry(async () => {
      attempts++;
      console.log(`[Attempt ${attempts}] Simulating ThrottlingException...`);
      throw { name: 'ThrottlingException', message: 'Rate limit exceeded' };
    }, {
      maxRetries: 3,
      initialDelay: 500,
      factor: 2
    });
  } catch (error) {
    console.log('✅ Test Complete: Final failure after retries as expected.');
  }
}

test();
