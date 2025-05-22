const Redis = require('ioredis');
const RedisStore = require('rate-limit-redis');

let redisClient = null;
let redisStore = null;

// Initialize Redis only if REDIS_URL is available
if (process.env.REDIS_URL) {
  try {
    // Parse Redis URL to handle Railway's format
    const redisUrl = new URL(process.env.REDIS_URL);
    
    redisClient = new Redis({
      host: redisUrl.hostname,
      port: redisUrl.port || 6379,
      password: redisUrl.password,
      tls: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    redisStore = new RedisStore({
      client: redisClient,
      prefix: 'rate-limit:',
      resetExpiryOnChange: true
    });

    // Handle Redis connection events
    redisClient.on('connect', () => {
      console.log('Redis client connected');
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
      // Don't crash the app, just log the error
    });

    // Graceful shutdown
    const cleanup = async () => {
      if (redisClient) {
        await redisClient.quit();
      }
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

  } catch (error) {
    console.error('Redis initialization error:', error);
    // Continue without Redis - will fall back to memory store
  }
}

module.exports = {
  redisClient,
  redisStore,
  // Helper function to check Redis status
  isRedisConnected: () => redisClient?.status === 'ready'
};
