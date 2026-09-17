import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAlerts, getUserSettings } from '../api/core';
import { getGuestHouseAlerts } from '../api/guesthouse';
import { useAppType } from './useAppType';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL = 60000;
const NotificationsContext = createContext(null);

const DEFAULT_PREFS = {
  notify_new_bookings: true,
  notify_payments: true,
  notify_weekly_reports: true,
  notify_staff_activity: true,
};

const timeAgo = (dateStr) => {
  if (!dateStr) return 'Recently';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 0) {
    const secondsUntil = Math.abs(diff);
    if (secondsUntil < 3600) return `In ${Math.max(1, Math.ceil(secondsUntil / 60))}m`;
    if (secondsUntil < 86400) return `In ${Math.ceil(secondsUntil / 3600)}h`;
    return `In ${Math.ceil(secondsUntil / 86400)}d`;
  }
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const seenKeyFor = (userId, isGuestHouse) => (
  `gateway-seen-notifications:${userId}:${isGuestHouse ? 'gh' : 'hall'}`
);

const loadSeen = (storageKey) => {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch {
    return new Set();
  }
};

const persistSeen = (storageKey, seenIds) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIds).slice(-300)));
  } catch {
    /* storage full / private mode */
  }
};

const mapHallAlerts = (alerts, prefs) => {
  const iconMap = { event: '📅', payment_due: '💰', inventory: '📦' };
  const items = [];

  if (prefs.notify_weekly_reports !== false) {
    items.push(
      ...(alerts.upcoming_events || []).map((e) => ({
        id: `event-${e.id}`,
        type: 'event',
        bookingId: e.id,
        title: `Upcoming: ${e.title}`,
        desc: `${e.desc} - ${e.customer}`,
        time: e.date,
        timeAgo: e.date ? timeAgo(e.date) : 'Soon',
        icon: iconMap.event,
      }))
    );
  }

  if (prefs.notify_staff_activity !== false) {
    items.push(
      ...(alerts.payment_due || []).map((p) => ({
        id: `due-${p.id}`,
        type: 'payment_due',
        bookingId: p.id,
        title: p.title || 'Balance due',
        desc: p.desc,
        time: p.date,
        timeAgo: p.date ? timeAgo(p.date) : 'Due',
        icon: iconMap.payment_due,
      }))
    );
  }

  items.push(
    ...(alerts.inventory_alerts || []).map((i) => ({
      id: `inv-${i.id}`,
      type: 'inventory',
      title: `Stock: ${i.title}`,
      desc: i.desc,
      time: i.date || null,
      timeAgo: 'Now',
      icon: iconMap.inventory,
    }))
  );

  return items;
};

const mapGuestHouseAlerts = (alerts) => [
  ...(alerts.upcoming_checkins || []).map((e) => ({
    id: `gh-in-${e.id}`,
    type: 'event',
    stayId: e.id,
    title: e.title,
    desc: e.desc,
    time: e.date,
    timeAgo: e.date ? timeAgo(e.date) : 'Soon',
    icon: '🏨',
  })),
  ...(alerts.payment_due || []).map((p) => ({
    id: `gh-due-${p.id}`,
    type: 'payment_due',
    stayId: p.id,
    title: p.title,
    desc: p.desc,
    time: p.date,
    timeAgo: p.date ? timeAgo(p.date) : 'Due',
    icon: '💰',
  })),
];

export const NotificationsProvider = ({ children }) => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { isGuestHouse } = useAppType();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const prefsRef = useRef({ ...DEFAULT_PREFS });
  const seenIdsRef = useRef(new Set());
  const storageKeyRef = useRef('');
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const prefsLoadedRef = useRef(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const key = seenKeyFor(userId, isGuestHouse);
    storageKeyRef.current = key;
    seenIdsRef.current = loadSeen(key);
  }, [userId, isGuestHouse]);

  const applyVisible = useCallback((items) => {
    const seen = seenIdsRef.current;
    const visible = items
      .filter((notification) => notification.id && !seen.has(String(notification.id)))
      .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    const next = visible.slice(0, 12);
    setNotifications(next);
    setUnreadCount(next.length);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !userId || document.hidden || requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    try {
      let items;
      if (isGuestHouse) {
        const alerts = await getGuestHouseAlerts();
        items = mapGuestHouseAlerts(alerts);
      } else {
        const settingsPromise = prefsLoadedRef.current
          ? Promise.resolve(null)
          : getUserSettings().catch(() => null);
        const [alerts, settings] = await Promise.all([getAlerts(), settingsPromise]);
        if (settings) {
          prefsRef.current = { ...DEFAULT_PREFS, ...settings };
        }
        prefsLoadedRef.current = true;
        items = mapHallAlerts(alerts, prefsRef.current);
      }

      if (!mountedRef.current) return;
      applyVisible(items);
    } catch {
      if (!mountedRef.current) return;
      if (isGuestHouse) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } finally {
      requestInFlightRef.current = false;
    }
  }, [applyVisible, isAuthenticated, isGuestHouse, userId]);

  useEffect(() => {
    mountedRef.current = true;
    if (authLoading || !isAuthenticated || !userId) return undefined;
    fetchNotifications();
    const interval = setInterval(() => {
      if (!document.hidden) fetchNotifications();
    }, POLL_INTERVAL);
    const onVisible = () => {
      if (!document.hidden) fetchNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mountedRef.current = false;
      requestInFlightRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authLoading, isAuthenticated, userId, fetchNotifications]);

  const markAllRead = useCallback(() => setUnreadCount(0), []);

  const dismissNotifications = useCallback((notificationIds) => {
    const ids = [...new Set((notificationIds || []).map(String).filter(Boolean))];
    if (ids.length === 0) return;
    ids.forEach((id) => seenIdsRef.current.add(id));
    persistSeen(storageKeyRef.current, seenIdsRef.current);
    setNotifications((current) => current.filter((notification) => !ids.includes(String(notification.id))));
    setUnreadCount((current) => Math.max(0, current - ids.length));
  }, []);

  const dismissNotification = useCallback(
    (notificationId) => dismissNotifications([notificationId]),
    [dismissNotifications],
  );

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    markAllRead,
    dismissNotification,
    dismissNotifications,
    refresh: fetchNotifications,
  }), [
    notifications,
    unreadCount,
    markAllRead,
    dismissNotification,
    dismissNotifications,
    fetchNotifications,
  ]);

  return createElement(NotificationsContext.Provider, { value }, children);
};

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return ctx;
};
