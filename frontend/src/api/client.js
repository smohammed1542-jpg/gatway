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

const GET_CACHE_TTL_MS = 45_000;
const getCache = new Map();
const inflightGets = new Map();

const requestMethod = (config) => (config.method || 'get').toLowerCase();

const stableParams = (params) => {
  if (!params || typeof params !== 'object') return '';
  const cleaned = { ...params };
  delete cleaned._t;
  const keys = Object.keys(cleaned).sort();
  if (!keys.length) return '';
  return JSON.stringify(keys.map((key) => [key, cleaned[key]]));
};

const cacheKey = (config) => (
  `${requestMethod(config)}:${config.baseURL || ''}${config.url || ''}?${stableParams(config.params)}`
);

const shouldCacheGet = (config) => {
  if (config.skipCache) return false;
  if (requestMethod(config) !== 'get') return false;
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) return false;
  const url = `${config.url || ''}`;
  if (/token|logout|search/i.test(url)) return false;
  return true;
};

export const invalidateApiCache = () => {
  getCache.clear();
  inflightGets.clear();
};

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.params && Object.prototype.hasOwnProperty.call(config.params, '_t')) {
      const rest = { ...config.params };
      delete rest._t;
      config.params = rest;
    }

    if (!shouldCacheGet(config)) return config;

    const key = cacheKey(config);
    const hit = getCache.get(key);
    if (hit && hit.expires > Date.now()) {
      config.adapter = () => Promise.resolve({
        data: hit.data,
        status: 200,
        statusText: 'OK',
        headers: hit.headers || {},
        config,
        request: { fromCache: true },
      });
      return config;
    }

    const pending = inflightGets.get(key);
    if (pending) {
      config.adapter = () => pending;
      return config;
    }

    const httpAdapter = axios.getAdapter(axios.defaults.adapter);
    let start;
    const promise = new Promise((resolve, reject) => {
      start = () => {
        Promise.resolve(httpAdapter(config)).then((response) => {
          if (response.status >= 200 && response.status < 300) {
            getCache.set(key, {
              data: response.data,
              headers: response.headers,
              expires: Date.now() + GET_CACHE_TTL_MS,
            });
          }
          resolve(response);
        }, reject).finally(() => {
          inflightGets.delete(key);
        });
      };
    });
    inflightGets.set(key, promise);
    config.adapter = () => {
      start();
      start = () => {};
      return promise;
    };
    return config;
  },
  (error) => Promise.reject(error),
);

client.interceptors.response.use(
  (response) => {
    if (requestMethod(response.config) !== 'get') {
      invalidateApiCache();
    }
    return response;
  },
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
          originalRequest.skipCache = true;
          return client(originalRequest);
        } catch {
          invalidateApiCache();
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
