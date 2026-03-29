/**
 * Universal S3 Utility - Hardened for 2026 Production Standards
 */

/**
 * Sanitize a string for use as an S3 key segment.
 * Ensures compatibility with AWS SDK v3 pattern validation: ^[a-zA-Z0-9._-]+$
 * 
 * @param {string} input - The raw string (course name, file name, etc.)
 * @returns {string} - The sanitized, URL-safe string.
 */
exports.sanitizeKey = (input) => {
  if (!input) {
    return 'untitled_' + Date.now().toString(36);
  }

  // 1. Lowercase and trim for consistency
  let sanitized = input.toLowerCase().trim();
  
  // 2. Transliterate or replace non-safe characters
  // Replace all whitespace with underscores
  sanitized = sanitized.replace(/\s+/g, '_');
  
  // 3. Remove any characters NOT in [a-z0-9._-]
  sanitized = sanitized.replace(/[^a-z0-9._-]/g, '');

  // 4. Collapse repeated underscores, dots, or hyphens (Pattern Hardening)
  sanitized = sanitized.replace(/_{2,}/g, '_');
  sanitized = sanitized.replace(/\.{2,}/g, '.');
  sanitized = sanitized.replace(/-{2,}/g, '-');

  // 5. S3 Best Practice: Ensure segments don't start or end with a separator
  sanitized = sanitized.replace(/^[._-]+|[._-]+$/g, '');

  // 6. Truncate to avoid extremely long keys (S3 limit is 1024, but we keep it reasonable)
  sanitized = sanitized.substring(0, 180);

  // 7. Final safety: if the result is empty (e.g. input was only emojis), provide a fallback
  return sanitized || 'untitled_' + Math.random().toString(36).substring(7);
};
