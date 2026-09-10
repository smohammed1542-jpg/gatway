import { useState, useEffect, useCallback, useRef } from 'react';
import { getAlerts, getUserSettings } from '../api/core';
import { getGuestHouseAlerts } from '../api/guesthouse';
import { useAppType } from './useAppType';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL = 30000;

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

export const useNotifications = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { isGuestHouse } = useAppType();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastFetchedAtRef = useRef(null);
  const requestInFlightRef = useRef(false);
  const [prefs, setPrefs] = useState({
    notify_new_bookings: true,
    notify_payments: true,
    notify_weekly_reports: true,
    notify_staff_activity: true,
  });
  const seenStorageKey = `gateway-seen-notifications:${user?.id || 'user'}:${isGuestHouse ? 'gh' : 'hall'}`;

  const getSeenIds = useCallback(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(seenStorageKey) || '[]');
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  }, [seenStorageKey]);

  useEffect(() => {
    getUserSettings()
      .then(setPrefs)
      .catch(() => {});
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    try {
      if (isGuestHouse) {
        const alerts = await getGuestHouseAlerts();
        const all = [
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
        const visible = all.filter((notification) => !getSeenIds().has(notification.id));
        setNotifications(visible.slice(0, 12));
        setUnreadCount(Math.min(visible.length, 8));
        lastFetchedAtRef.current = new Date();
        return;
      }

      const alerts = await getAlerts();

      const iconMap = { event: '📅', payment_due: '💰', inventory: '📦' };
      const alertNotifs = [];

      if (prefs.notify_weekly_reports !== false) {
        alertNotifs.push(
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
        alertNotifs.push(
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

      alertNotifs.push(
        ...(alerts.inventory_alerts || []).map((i) => ({
          id: `inv-${i.id}`,
          type: 'inventory',
          title: `Stock: ${i.title}`,
          desc: i.desc,
          time: new Date().toISOString(),
          timeAgo: 'Now',
          icon: iconMap.inventory,
        }))
      );

      const all = alertNotifs.sort(
        (a, b) => new Date(b.time || 0) - new Date(a.time || 0)
      );
      const visible = all.filter((notification) => !getSeenIds().has(notification.id));

      if (lastFetchedAtRef.current) {
        const newCount = visible.filter((n) => (
          n.time && new Date(n.time) > lastFetchedAtRef.current
        )).length;
        if (newCount > 0) setUnreadCount((prev) => prev + newCount);
      } else {
        setUnreadCount(Math.min(visible.length, 8));
      }

      setNotifications(visible.slice(0, 12));
      lastFetchedAtRef.current = new Date();
    } catch {
      /* silent poll failure */
      if (isGuestHouse) setNotifications([]);
    } finally {
      requestInFlightRef.current = false;
    }
  }, [prefs, isGuestHouse, isAuthenticated, getSeenIds]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return undefined;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications, authLoading, isAuthenticated]);

  const markAllRead = () => setUnreadCount(0);

  const dismissNotifications = useCallback((notificationIds) => {
    const ids = new Set(notificationIds);
    if (ids.size === 0) return;
    const seenIds = getSeenIds();
    ids.forEach((notificationId) => seenIds.add(notificationId));
    try {
      localStorage.setItem(seenStorageKey, JSON.stringify(Array.from(seenIds).slice(-200)));
    } catch {
      // Keep the notification hidden for this session even if storage is unavailable.
    }
    setNotifications((current) => current.filter((notification) => !ids.has(notification.id)));
    setUnreadCount((current) => Math.max(0, current - ids.size));
  }, [getSeenIds, seenStorageKey]);

  const dismissNotification = useCallback(
    (notificationId) => dismissNotifications([notificationId]),
    [dismissNotifications],
  );

  return {
    notifications,
    unreadCount,
    markAllRead,
    dismissNotification,
    dismissNotifications,
    refresh: fetchNotifications,
  };
};
