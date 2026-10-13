# ==========================================
# Multi-Stage Production Dockerfile for Frontend (Vite + React)
# ==========================================

# Stage 1: Build the React Application
FROM node:20-alpine AS builder

WORKDIR /app

# Layer Caching: Copy package manifests first
COPY frontend/package*.json ./

# Deterministic install using package-lock.json with network retry resilience
RUN npm ci --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=10000

# Accept build argument for the backend API URL (injected by Render/Docker)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Copy source code and build production bundle
COPY frontend/ ./
RUN npm run build

# Stage 2: Serve the production bundle with ultra-lightweight Nginx
FROM nginx:alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled assets from Stage 1 builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration (reverse proxy + SPA routing)
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
