const s3Utils = require('./backend/src/utils/s3Utils');

const testCases = [
    "DEVOPS BootCamp  By Tech World With NANA",
    "  Space  Test  ",
    "Module 1: Intro (Draft).pdf",
    "!!!-Special_Chars-!!!"
];

console.log("🚀 S3 Sanitization Test Board\n");
testCases.forEach(tc => {
    console.log(`Original:  [${tc}]`);
    console.log(`Sanitized: [${s3Utils.sanitizeKey(tc)}]\n`);
});
