import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'gateway-ui:';

export default function usePersistentState(key, initialValue) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) return JSON.parse(saved);
    } catch {
      // Fall back to the supplied default when storage is unavailable or invalid.
    }
    return typeof initialValue === 'function' ? initialValue() : initialValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // State still works for the current session when storage is unavailable.
    }
  }, [storageKey, value]);

  return [value, setValue];
}
