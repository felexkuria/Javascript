
// Health Check Service
const mongoose = require('mongoose');
const { logger } = require('./errorHandling');

class HealthCheckService {
    constructor() {
        this.checks = new Map();
        this.startPeriodicChecks();
    }

    async checkDatabase() {
        try {
            if (!mongoose.connection.readyState) {
                return { status: 'down', message: 'Not connected' };
            }
            
            await mongoose.connection.db.admin().ping();
            return { status: 'up', message: 'Connected and responsive' };
        } catch (error) {
            return { status: 'down', message: error.message };
        }
    }

    async checkMemory() {
        const usage = process.memoryUsage();
        const totalMB = Math.round(usage.rss / 1024 / 1024);
        
        return {
            status: totalMB < 512 ? 'up' : 'warning',
            message: `Memory usage: ${totalMB}MB`,
            details: {
                rss: Math.round(usage.rss / 1024 / 1024),
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024)
            }
        };
    }

    async getOverallHealth() {
        const checks = {
            database: await this.checkDatabase(),
            memory: await this.checkMemory(),
            uptime: {
                status: 'up',
                message: `Uptime: ${Math.round(process.uptime())}s`
            }
        };

        const overallStatus = Object.values(checks).every(check => check.status === 'up') 
            ? 'healthy' 
            : 'degraded';

        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            checks
        };
    }

    startPeriodicChecks() {
        // Check every 30 seconds
        setInterval(async () => {
            const health = await this.getOverallHealth();
            
            if (health.status === 'degraded') {
                logger.warn('System health degraded', health);
            }
            
            this.checks.set('latest', health);
        }, 30000);
    }

    getLatestHealth() {
        return this.checks.get('latest') || { status: 'unknown', message: 'No health data available' };
    }
}

module.exports = new HealthCheckService();
