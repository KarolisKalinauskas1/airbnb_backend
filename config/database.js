/**
 * Enhanced Database Connection Manager
 */
const { PrismaClient } = require('@prisma/client');
const EventEmitter = require('events');

// Maximum retry attempts for database connection
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

class DatabaseService extends EventEmitter {
  constructor() {
    super();
    
    // Initialize properties
    this._isConnected = false;
    this._isConnecting = false;
    this._connectionAttempts = 0;
    this._lastError = null;
    this._offlineMode = process.env.OFFLINE_MODE === 'true';
    
    // Ensure we have DATABASE_URL
    if (!process.env.DATABASE_URL && !this._offlineMode) {
      const error = new Error('DATABASE_URL environment variable is not set');
      this._lastError = error;
      console.error('❌ ' + error.message);
      console.error('   Please check your .env file and ensure DATABASE_URL is set correctly');
      return;
    }
    
    // Check if using port 5432 (which might be blocked)
    if (process.env.DATABASE_URL?.includes(':5432/')) {
      console.log('⚠️ Your DATABASE_URL is using port 5432, which might be blocked.');
      console.log('   If you have connection issues, try one of these solutions:');
      console.log('   1. Run: npm run network-test (to diagnose issues)');
      console.log('   2. Connect using a mobile hotspot to bypass network restrictions');
      console.log('   3. Try alternative ports like 6543 or 5433 in your DATABASE_URL');
    }
    
    // Try to create Prisma client with error handling
    try {
      this.prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        errorFormat: 'pretty',
        // Explicitly set from environment variable to ensure it's the latest value
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        }
      });
      
      console.log('Database client initialized');
    } catch (error) {
      console.error('Failed to initialize Prisma client:', error.message);
      this._lastError = error;
    }
    
    // Initialize connection (but don't await it)
    this.initializeConnection();
  }
  
  async initializeConnection() {
    // Skip if offline mode is enabled
    if (this._offlineMode) {
      console.log('⚠️ Offline mode enabled - skipping database connection');
      return false;
    }
    
    // Try initial connection without throwing
    try {
      await this.connect();
      return true;
    } catch (error) {
      console.error('Initial database connection failed:', error.message);
      console.log('Application will continue with limited functionality');
      
      if (error.message.includes('5432') && error.message.includes("Can't reach database server")) {
        console.log('\n⚠️ Port 5432 appears to be blocked. Try these solutions:');
        console.log('1. Run: npm run network-test - to find a working port');
        console.log('2. Try connecting from a different network (e.g., mobile hotspot)');
        console.log('3. Edit your .env file to change port 5432 to 6543 in DATABASE_URL\n');
      }
      
      return false;
    }
  }
  
  async connect() {
    if (this._offlineMode) return false;
    if (this._isConnecting || this._isConnected) return this._isConnected;
    
    this._isConnecting = true;
    
    try {
      // First test connection without affecting state
      await this.prisma.$connect();
      
      // Try a simple query to really test the connection
      await this.prisma.$queryRaw`SELECT 1 as result`;
      
      // If we get here, connection succeeded
      console.log('✅ Database connection established');
      this._isConnected = true;
      this._isConnecting = false;
      this._connectionAttempts = 0;
      this._lastError = null;
      
      this.emit('connected');
      return true;
    } catch (error) {
      this._isConnected = false;
      this._isConnecting = false;
      this._lastError = error;
      this._connectionAttempts++;
      
      // Emit error event
      this.emit('error', error);
      
      // Re-throw the error to be handled by the caller
      throw error;
    }
  }
  
  async disconnect() {
    if (!this._isConnected) return;
    
    try {
      await this.prisma.$disconnect();
      this._isConnected = false;
      this.emit('disconnected');
    } catch (error) {
      console.error('Error disconnecting from database:', error);
    }
  }
  
  /**
   * Test database connection 
   * @returns {Promise<boolean>} True if connected, false otherwise
   */
  async testConnection() {
    if (this._offlineMode) return false;
    
    try {
      // Try a simple query
      await this.prisma.$queryRaw`SELECT 1 as result`;
      
      // Update state if needed
      if (!this._isConnected) {
        this._isConnected = true;
        this.emit('connected');
      }
      
      return true;
    } catch (error) {
      // Update state if needed
      if (this._isConnected) {
        this._isConnected = false;
        this._lastError = error;
        this.emit('disconnected');
      }
      
      return false;
    }
  }
  
  /**
   * Execute database operation with retry support
   * @param {Function} operation - Function that receives prisma client and performs operations
   * @param {Object} options - Options for error handling
   */
  async execute(operation, options = {}) {
    if (this._offlineMode) {
      return options.defaultValue || null;
    }
    
    const {
      defaultValue = null,
      errorMessage = 'Database operation failed',
      retries = 1
    } = options;
    
    // Try to ensure we're connected first if we're not already
    if (!this._isConnected) {
      try {
        const connected = await this.testConnection();
        if (!connected) {
          console.warn('Database not connected, operation will likely fail');
        }
      } catch (error) {
        console.warn('Failed to test database connection:', error.message);
      }
    }
    
    // Execute the operation with retry logic
    try {
      return await operation(this.prisma);
    } catch (error) {
      if (retries > 0) {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Try again with one less retry
        return this.execute(operation, {
          ...options,
          retries: retries - 1
        });
      }
      
      console.error(`${errorMessage}:`, error);
      return defaultValue;
    }
  }
  
  // Getters for state
  get isConnected() {
    return this._isConnected;
  }
  
  get lastError() {
    return this._lastError;
  }
  
  get offlineMode() {
    return this._offlineMode;
  }
  
  get client() {
    return this.prisma;
  }
}

// Export a singleton instance
const dbService = new DatabaseService();
module.exports = dbService;
