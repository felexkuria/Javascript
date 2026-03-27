/**
 * 🔁 Exponential Backoff Utility (Google SRE Standard)
 * Used to retry transient failures (like AI rate limits or network blips).
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000, // 1s
    factor = 2,           // Double the delay each time
    retryableErrors = ['ThrottlingException', 'ProvisionedThroughputExceededException', 'LimitExceededException', 'TooManyRequestsException']
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      const isRetryable = retryableErrors.some(code => 
        error.message.includes(code) || error.name === code || error.code === code
      );

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      console.warn(`⚠️  Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= factor;
    }
  }

  throw lastError;
}

module.exports = { withRetry };
