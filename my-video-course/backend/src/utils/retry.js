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

      // 🎲 Full Jitter Implementation (SRE Best Practice)
      const jitter = Math.random() * 200; // 0-200ms random offset
      const totalDelay = delay + jitter;

      const logger = require('./logger');
      logger.warn(`🔁 Retry attempt ${attempt + 1}/${maxRetries}`, {
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(totalDelay),
        error: error.message,
        code: error.code || error.name
      });
      
      await new Promise(resolve => setTimeout(resolve, totalDelay));
      delay *= factor;
    }
  }

  throw lastError;
}

module.exports = { withRetry };
