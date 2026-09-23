import { useEffect, useState } from 'react';

const STORAGE_KEY = 'gateway-ui:show-hijri-calendar';
const EVENT_NAME = 'hallora-hijri';

export function getShowHijriCalendar() {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return true;
    return JSON.parse(saved) !== false;
  } catch {
    return true;
  }
}

export function setShowHijriCalendar(show) {
  const next = Boolean(show);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Preference still applies for this session.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }
}

export function useShowHijriCalendar() {
  const [showHijri, setShowHijri] = useState(getShowHijriCalendar);

  useEffect(() => {
    const onSync = (event) => setShowHijri(Boolean(event.detail));
    window.addEventListener(EVENT_NAME, onSync);
    return () => window.removeEventListener(EVENT_NAME, onSync);
  }, []);

  const setShowHijriCalendarPref = (value) => {
    const next = Boolean(value);
    setShowHijri(next);
    setShowHijriCalendar(next);
  };

  return [showHijri, setShowHijriCalendarPref];
}
