import axios from 'axios';
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  persistAuthSession,
} from '../utils/authSession';

/** Dev: Vite proxy `/api` → Django. Prod: VITE_API_BASE_URL or same-origin /api. */
function normalizeApiBase(raw) {
  if (!raw || !String(raw).trim()) return '/api';
  const trimmed = String(raw).trim().replace(/\/$/, '');
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the JWT token
client.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Add a response interceptor to handle token expiration
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE}/auth/token/refresh/`, {
            refresh: refreshToken,
          });
          persistAuthSession({ access: response.data.access, refresh: refreshToken });
          originalRequest.headers.Authorization = `Bearer ${response.data.access}`;
          return client(originalRequest);
        } catch {
          clearAuthSession();
          if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
          }
        }
      } else {
        clearAuthSession();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;
