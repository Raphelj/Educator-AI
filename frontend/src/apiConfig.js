// Centralized API configuration
// - In cloud production: uses VITE_API_BASE_URL (e.g. https://educator-ai-backend.onrender.com)
// - In local dev: defaults to http://127.0.0.1:8000
const rawUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:8000');
export const API_BASE_URL = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
