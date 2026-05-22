FROM node:20-alpine

WORKDIR /app

# Install Chromium and its dependencies for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Expose port
EXPOSE 5000

# Docker needs the server to bind beyond loopback; local non-Docker runs default to 127.0.0.1.
ENV HOST=0.0.0.0

# Start development server
CMD ["npm", "run", "dev"]
