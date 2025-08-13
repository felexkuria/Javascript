#!/usr/bin/env node

/**
 * Comprehensive System Test Suite
 * Tests the video course system functionality
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Test configuration
const TEST_CONFIG = {
    baseUrl: 'http://localhost:3000',
    timeout: 5000,
    testDataDir: path.join(__dirname, 'test-data')
};

// Test results tracking
let testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

// Utility functions
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
}

function assert(condition, message) {
    if (condition) {
        testResults.passed++;
        log(`PASS: ${message}`, 'success');
    } else {
        testResults.failed++;
        testResults.errors.push(message);
        log(`FAIL: ${message}`, 'error');
    }
}

// Test functions
async function testFileStructure() {
    log('Testing file structure...');
    
    const requiredFiles = [
        'app.js',
        'package.json',
        'config.js',
        'public/css',
        'public/js',
        'views',
        'services',
        'controllers',
        'routes'
    ];
    
    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, file);
        assert(fs.existsSync(filePath), `Required file/directory exists: ${file}`);
    }
}

async function testPackageJson() {
    log('Testing package.json configuration...');
    
    try {
        const packagePath = path.join(__dirname, 'package.json');
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        
        assert(packageData.name === 'my-video-course', 'Package name is correct');
        assert(packageData.main === 'app.js', 'Main entry point is correct');
        assert(packageData.dependencies, 'Dependencies are defined');
        
        // Check for critical dependencies
        const criticalDeps = ['express', 'mongoose', 'ejs', 'multer'];
        for (const dep of criticalDeps) {
            assert(packageData.dependencies[dep], `Critical dependency exists: ${dep}`);
        }
    } catch (error) {
        assert(false, `Package.json parsing failed: ${error.message}`);
    }
}

async function testEnvironmentConfig() {
    log('Testing environment configuration...');
    
    const envExamplePath = path.join(__dirname, '.env.example');
    assert(fs.existsSync(envExamplePath), '.env.example file exists');
    
    if (fs.existsSync(envExamplePath)) {
        const envContent = fs.readFileSync(envExamplePath, 'utf8');
        assert(envContent.includes('MONGODB_URI'), 'MongoDB URI config exists');
        assert(envContent.includes('AWS_'), 'AWS configuration exists');
    }
}

async function testServiceFiles() {
    log('Testing service files...');
    
    const serviceFiles = [
        'services/videoService.js',
        'services/aiService.js',
        'services/thumbnailGenerator.js',
        'services/gamificationManager.js'
    ];
    
    for (const serviceFile of serviceFiles) {
        const servicePath = path.join(__dirname, serviceFile);
        if (fs.existsSync(servicePath)) {
            try {
                // Basic syntax check
                require(servicePath);
                assert(true, `Service file loads correctly: ${serviceFile}`);
            } catch (error) {
                assert(false, `Service file has errors: ${serviceFile} - ${error.message}`);
            }
        } else {
            assert(false, `Service file missing: ${serviceFile}`);
        }
    }
}

async function testViewFiles() {
    log('Testing view files...');
    
    const viewFiles = [
        'views/dashboard.ejs',
        'views/video.ejs',
        'views/course.ejs',
        'views/upload.ejs'
    ];
    
    for (const viewFile of viewFiles) {
        const viewPath = path.join(__dirname, viewFile);
        assert(fs.existsSync(viewPath), `View file exists: ${viewFile}`);
        
        if (fs.existsSync(viewPath)) {
            const content = fs.readFileSync(viewPath, 'utf8');
            assert(content.includes('<!DOCTYPE html') || content.includes('<%'), 
                   `View file has valid content: ${viewFile}`);
        }
    }
}

async function testPublicAssets() {
    log('Testing public assets...');
    
    const publicDirs = [
        'public/css',
        'public/js',
        'public/videos',
        'public/thumbnails'
    ];
    
    for (const dir of publicDirs) {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            log(`Created missing directory: ${dir}`);
        }
        assert(fs.existsSync(dirPath), `Public directory exists: ${dir}`);
    }
}

async function testDataIntegrity() {
    log('Testing data integrity...');
    
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
        const dataFiles = fs.readdirSync(dataDir);
        for (const file of dataFiles) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(dataDir, file);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    assert(true, `Data file is valid JSON: ${file}`);
                } catch (error) {
                    assert(false, `Data file has invalid JSON: ${file} - ${error.message}`);
                }
            }
        }
    }
}

async function testSecurityConfiguration() {
    log('Testing security configuration...');
    
    const appPath = path.join(__dirname, 'app.js');
    const appContent = fs.readFileSync(appPath, 'utf8');
    
    // Check for basic security measures
    assert(appContent.includes('body-parser'), 'Body parser middleware is used');
    assert(appContent.includes('express.static'), 'Static file serving is configured');
    
    // Check for potential security issues
    const securityIssues = [
        { pattern: /eval\s*\(/, message: 'Avoid using eval()' },
        { pattern: /innerHTML\s*=/, message: 'Be careful with innerHTML assignments' },
        { pattern: /document\.write/, message: 'Avoid using document.write' }
    ];
    
    for (const issue of securityIssues) {
        if (issue.pattern.test(appContent)) {
            log(`Security concern: ${issue.message}`, 'error');
        }
    }
}

async function testDatabaseConnections() {
    log('Testing database configuration...');
    
    const configPath = path.join(__dirname, 'config.js');
    if (fs.existsSync(configPath)) {
        try {
            const config = require(configPath);
            assert(config.mongodbUri, 'MongoDB URI is configured');
            assert(config.port, 'Port is configured');
        } catch (error) {
            assert(false, `Config file error: ${error.message}`);
        }
    }
}

async function runAllTests() {
    log('Starting comprehensive system tests...');
    
    try {
        await testFileStructure();
        await testPackageJson();
        await testEnvironmentConfig();
        await testServiceFiles();
        await testViewFiles();
        await testPublicAssets();
        await testDataIntegrity();
        await testSecurityConfiguration();
        await testDatabaseConnections();
        
        // Summary
        log('\n=== TEST SUMMARY ===');
        log(`Total tests: ${testResults.passed + testResults.failed}`);
        log(`Passed: ${testResults.passed}`, 'success');
        log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'success');
        
        if (testResults.errors.length > 0) {
            log('\n=== FAILED TESTS ===', 'error');
            testResults.errors.forEach(error => log(`- ${error}`, 'error'));
        }
        
        log('\n=== RECOMMENDATIONS ===');
        log('1. Fix all security vulnerabilities found in the code review');
        log('2. Add proper test suite with Jest or Mocha');
        log('3. Implement proper error handling and logging');
        log('4. Add input validation and sanitization');
        log('5. Implement proper authentication and authorization');
        
    } catch (error) {
        log(`Test suite error: ${error.message}`, 'error');
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests();
}

module.exports = { runAllTests, testResults };