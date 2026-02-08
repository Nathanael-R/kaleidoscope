# Multi-stage production build for Kaleidoscope
# Builds frontend, server, and serves everything from a single container

# Stage 1: Build frontend
FROM node:22-alpine AS client-build
WORKDIR /app/mosaic-client
COPY mosaic-client/package*.json ./
RUN npm ci --ignore-scripts
COPY mosaic-client/ ./
RUN npm run build

# Stage 2: Build server
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --ignore-scripts
COPY server/ ./
RUN npx esbuild index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Stage 3: Production runtime
FROM node:22-alpine
WORKDIR /app

# Install production dependencies for server
COPY server/package*.json ./
RUN npm ci --ignore-scripts --omit=dev && npm cache clean --force

# Copy built server
COPY --from=server-build /app/server/dist ./dist

# Copy built frontend into dist/public for Express static serving
COPY --from=client-build /app/mosaic-client/dist ./dist/public

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.js"]
