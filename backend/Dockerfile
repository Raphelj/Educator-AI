# ==========================================
# True Multi-Stage Production Dockerfile for Educator AI Backend
# ==========================================

# Stage 1: Build & Dependency Resolution Stage
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Install compilation toolchain needed for psycopg2 and C-extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .

# Upgrade pip, install lean CPU-only PyTorch wheel, then install all requirements
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt


# Stage 2: Minimal Production Runtime
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Install only minimal runtime libraries (no compilers/build-essential)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-installed Python packages and executables from builder stage
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy backend application source code
COPY backend/ /app/backend/

# Security Hardening: Run as non-privileged appuser
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app
USER appuser

# Health check to ensure API is responding
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start Uvicorn production server (binds dynamically to Render's $PORT or 8000)
CMD sh -c "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"
