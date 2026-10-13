// Centralized API configuration
// - In local dev (npm run dev): defaults to http://127.0.0.1:8000
// - In production Docker build: defaults to /api (reverse-proxied via Nginx)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:8000');
