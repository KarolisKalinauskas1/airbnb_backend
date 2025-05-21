# Use Node.js 18 Alpine as base image
FROM node:18-alpine AS base

# Install system dependencies including OpenSSL
RUN apk add --no-cache openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files and Prisma schema first
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install only production dependencies first
RUN npm ci --only=production --ignore-scripts

# Generate Prisma client
RUN npx prisma generate

# Install dev dependencies for building
RUN npm ci --only=development --ignore-scripts && \
    npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Copy node_modules and other files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/config ./config
COPY --from=builder /app/src/middleware ./src/middleware
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/schemas ./schemas
COPY --from=builder /app/utils ./utils
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/vercel-server.js ./vercel-server.js

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs
USER expressjs

# Expose the port
EXPOSE 3000

# Run the app
CMD ["node", "server.js"]
