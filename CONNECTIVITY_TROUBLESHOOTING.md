# Database Connectivity Troubleshooting Guide

If you're experiencing issues connecting to your Supabase database, this guide will help you diagnose and resolve the problem.

## Common Connectivity Issues

The most common issue is that your network (especially school or corporate networks) may be blocking outbound connections to database ports. Supabase uses port 6543 by default for its connection pooler, which is often blocked by firewalls.

## Step 1: Run the Port Scanner

First, run our port scanner to check which ports are accessible:

```bash
npm run scan-ports
```

This will tell you if any ports to your database host are accessible.

## Step 2: Test Alternative Database Configurations

If the port scanner found open ports, test different database configurations:

```bash
npm run test-ports
```

This will automatically test different port combinations and can update your .env file with a working configuration.

## Step 3: Try a Different Network

If both tools above failed to find a working configuration, try connecting from a different network:

1. Mobile hotspot
2. Home network
3. Public WiFi

School and corporate networks often block database ports for security reasons.

## Step 4: Use Offline Mode for Development

If you need to work on your application but can't establish a database connection, use offline mode:

```bash
npm run offline-mode
```

This will start your application with mock data, allowing you to continue development without a database connection.

## Understanding Error Messages

### "Can't reach database server at aws-0-eu-central-1.pooler.supabase.com:6543"

This means your application cannot establish a TCP connection to the database server on the specified port. Possible causes:

1. Network blocking the port
2. DNS resolution issues
3. Supabase service might be down

### "Connection timed out"

This typically means a firewall is blocking the connection.

### "Authentication failed"

This means the connection was established but your credentials are incorrect.

## Checking Supabase Status

Visit https://status.supabase.com/ to check if there are any known issues with Supabase services.

## Additional Resources

- [Supabase Database Documentation](https://supabase.com/docs/guides/database)
- [Prisma Connection Issues](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/connection-management)
