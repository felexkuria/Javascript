/**
 * 🛰️ Google-Grade Structured Logger
 * Outputs logs in JSON format for easy CloudWatch/Elasticsearch ingestion.
 */
class Logger {
  constructor(serviceContext = 'video-pipeline') {
    this.service = serviceContext;
  }

  /**
   * Core logging function
   * @param {string} level - INFO, WARN, ERROR
   * @param {string} message - Human-readable message
   * @param {object} metadata - Structured data for filtering
   */
  log(level, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      service: this.service,
      level: level.toUpperCase(),
      message,
      ...metadata
    };

    // Use standard stdout for CloudWatch Logs ingestion
    console.log(JSON.stringify(entry));
  }

  info(message, metadata) { this.log('INFO', message, metadata); }
  warn(message, metadata) { this.log('WARN', message, metadata); }
  error(message, error, metadata = {}) {
    this.log('ERROR', message, {
      ...metadata,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

module.exports = new Logger();
