# Redis Configuration for Railway

When deploying to Railway, follow these steps to set up Redis:

1. Add Redis Plugin:
   - Go to your project on Railway
   - Click "New" -> "Database" -> "Add Redis"
   - Railway will automatically provision a Redis instance

2. Environment Variables:
   The following environment variables will be automatically added by Railway:
   - `REDIS_URL`: The connection URL for Redis (automatically set by Railway)

3. Additional Configuration (if needed):
   You may want to set these optional environment variables in your Railway project settings:
   - `RATE_LIMIT_WHITELIST`: Comma-separated list of IPs to whitelist
   - `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds (default: 900000)
   - `RATE_LIMIT_MAX`: Maximum requests per window (default: 100)

4. Health Check:
   The application includes Redis in its health checks. You can verify Redis connectivity by:
   - Visiting `/api/health/detailed` endpoint
   - Checking Railway logs for Redis connection messages

5. Fallback Behavior:
   If Redis connection fails, the application will automatically fall back to in-memory rate limiting.

## Production Considerations

1. Scaling:
   - Redis connections are automatically managed
   - The application handles Redis reconnection automatically
   - Connection pooling is handled by ioredis

2. Security:
   - TLS is enabled by default for Redis connections in production
   - Passwords are handled automatically by Railway
   - Rate limiting protects against abuse

3. Monitoring:
   - Use Railway's built-in monitoring for Redis metrics
   - Application logs will show Redis connection status
   - Health check endpoint provides Redis status

4. Troubleshooting:
   - Check Railway logs for Redis connection issues
   - Verify environment variables are correctly set
   - Monitor Redis memory usage in Railway dashboard
