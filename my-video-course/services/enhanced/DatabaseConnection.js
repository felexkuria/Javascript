
// Enhanced MongoDB Connection with ECONNRESET handling
const mongoose = require('mongoose');

class DatabaseConnection {
    constructor() {
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000; // 5 seconds
        this.connectionTimeout = 30000; // 30 seconds
    }

    async connect(mongoUri) {
        const connectionOptions = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            
            // Connection timeout settings
            serverSelectionTimeoutMS: this.connectionTimeout,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            
            // Connection pool settings to prevent ECONNRESET
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            
            // Heartbeat settings
            heartbeatFrequencyMS: 10000,
            
            // Buffer settings
            bufferMaxEntries: 0,
            bufferCommands: false,
            
            // Retry settings
            retryWrites: true,
            retryReads: true,
            
            // Family setting to force IPv4
            family: 4
        };

        try {
            console.log('Attempting to connect to MongoDB...');
            
            await mongoose.connect(mongoUri, connectionOptions);
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            console.log('✅ Successfully connected to MongoDB');
            
            // Set up connection event handlers
            this.setupEventHandlers();
            
            return true;
            
        } catch (error) {
            console.error('❌ MongoDB connection failed:', error.message);
            this.isConnected = false;
            
            // Handle specific error types
            if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
                console.log('🔄 Network error detected, will retry connection...');
                await this.scheduleReconnect(mongoUri);
            }
            
            return false;
        }
    }

    setupEventHandlers() {
        // Connection successful
        mongoose.connection.on('connected', () => {
            console.log('✅ Mongoose connected to MongoDB');
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });

        // Connection error
        mongoose.connection.on('error', (error) => {
            console.error('❌ Mongoose connection error:', error.message);
            this.isConnected = false;
            
            // Handle ECONNRESET specifically
            if (error.code === 'ECONNRESET') {
                console.log('🔄 Connection reset detected, attempting to reconnect...');
                this.handleConnectionReset();
            }
        });

        // Connection disconnected
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ Mongoose disconnected from MongoDB');
            this.isConnected = false;
        });

        // Connection reconnected
        mongoose.connection.on('reconnected', () => {
            console.log('✅ Mongoose reconnected to MongoDB');
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });

        // Handle process termination
        process.on('SIGINT', async () => {
            console.log('🛑 Received SIGINT, closing MongoDB connection...');
            await mongoose.connection.close();
            process.exit(0);
        });
    }

    async handleConnectionReset() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            setTimeout(() => {
                mongoose.connection.readyState === 0 && mongoose.connect();
            }, this.reconnectInterval * this.reconnectAttempts);
        } else {
            console.error('❌ Max reconnection attempts reached, switching to offline mode');
            this.isConnected = false;
        }
    }

    async scheduleReconnect(mongoUri) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectInterval * this.reconnectAttempts;
            
            console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
            
            setTimeout(async () => {
                await this.connect(mongoUri);
            }, delay);
        }
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection.readyState,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

module.exports = DatabaseConnection;
