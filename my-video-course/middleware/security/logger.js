
// Safe logging utility
function safeLog(message, userInput = '') {
    const sanitizedInput = typeof userInput === 'string' 
        ? encodeURIComponent(userInput).substring(0, 100)
        : '[non-string input]';
    console.log(`${message}: ${sanitizedInput}`);
}

// Export for use in other modules
module.exports = { safeLog };
