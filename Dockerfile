# ---- Stage 1: Build ----
# Use Node 20 on Alpine Linux for a lightweight, minimal image footprint
FROM node:20-alpine AS builder

# Set the working directory for subsequent operations
WORKDIR /app

# Copy dependency manifests first to leverage Docker's layer caching.
# This ensures that 'npm ci' only executes when dependencies actually change,
# preventing unnecessary re-installation during local code changes.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the application source code and execute the build command.
# This compiles TypeScript source files into executable JavaScript artifacts in the /dist folder.
COPY . .
RUN npm run build

# ---- Stage 2: Production ----
# Start a fresh stage to create an optimized production image without build tools
FROM node:20-alpine AS production

WORKDIR /app

# Create a system user and group (non-root) to run the application.
# This is a critical security practice to restrict process privileges and 
# mitigate the impact of potential container escapes.
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy package manifests again to install production-only dependencies
COPY package.json package-lock.json ./

# Install dependencies with '--omit=dev' to exclude development tools (e.g., TS, ESLint),
# significantly reducing the image size and the runtime attack surface.
RUN npm ci --omit=dev

# Copy only the compiled artifacts (dist folder) from the builder stage.
# This discards all source code, TS configs, and build-time dependencies.
COPY --from=builder /app/dist ./dist

# Change file ownership to the non-root user and switch to them for execution.
# This ensures the process does not run with root privileges.
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the application port for documentation and container networking
EXPOSE 5000

# Configure a health check that periodically probes the application endpoint.
# This allows container orchestrators to verify service availability automatically.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Set the entry point to execute the compiled production server
CMD ["node", "dist/server.js"]