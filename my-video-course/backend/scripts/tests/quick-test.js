const http = require('http');

async function testEndpoint(port, endpoint) {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}${endpoint}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    success: res.statusCode === 200,
                    isJson: res.headers['content-type']?.includes('application/json'),
                    isHtml: res.headers['content-type']?.includes('text/html')
                });
            });
        });
        req.on('error', () => resolve({ status: 0, success: false }));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve({ status: 0, success: false, error: 'timeout' });
        });
    });
}

async function quickTest(port, version) {
    console.log(`\n🧪 Testing ${version} on port ${port}`);
    
    const tests = [
        { name: 'Health', endpoint: '/health' },
        { name: 'Dashboard', endpoint: '/' },
        { name: 'API Courses', endpoint: '/api/courses' },
        { name: 'API Videos', endpoint: '/api/videos' }
    ];
    
    for (const test of tests) {
        const result = await testEndpoint(port, test.endpoint);
        const status = result.success ? '✅' : '❌';
        const type = result.isJson ? 'JSON' : result.isHtml ? 'HTML' : 'OTHER';
        console.log(`  ${status} ${test.name} (${type})`);
    }
}

async function main() {
    console.log('🚀 Quick Server Test\n');
    
    // Test original (assuming it's running on 3000)
    await quickTest(3000, 'Original');
    
    // Test refactored (if running on different port)
    await quickTest(3002, 'Refactored');
}

main().catch(console.error);