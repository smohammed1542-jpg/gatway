/** Resolve Django media URLs for <img src> in dev and prod. */
import { getAccessToken } from './authSession';

export function getMediaBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '');
  }
  return '';
}

function withMediaAccess(path) {
  if (!path || path.includes('/landing/')) return path;
  const token = getAccessToken();
  if (!token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}access=${encodeURIComponent(token)}`;
}

export function resolveMediaUrl(url) {
  if (!url) return '';

  if (url.startsWith('blob:')) return url;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/media/')) {
        if (import.meta.env.DEV) return withMediaAccess(parsed.pathname + parsed.search);
        const apiBase = getMediaBaseUrl();
        if (apiBase && parsed.host === new URL(apiBase).host) {
          return withMediaAccess(parsed.pathname + parsed.search);
        }
      }
    } catch {
      /* keep original */
    }
    return url;
  }

  const path = url.startsWith('/') ? url : `/${url}`;

  if (import.meta.env.DEV) {
    return withMediaAccess(path);
  }

  const base = getMediaBaseUrl();
  const resolved = base ? `${base}${path}` : path;
  return withMediaAccess(resolved);
}
