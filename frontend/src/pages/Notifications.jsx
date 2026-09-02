import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, RefreshCw, Calendar, Wallet, Package, MessageSquare } from 'lucide-react';
import client from '../api/client';
import toast from 'react-hot-toast';
import AppLoader from '../components/AppLoader';
import { normalizeList } from '../utils/listData';
import { useNotifications } from '../hooks/useNotifications';
import { useAppType } from '../hooks/useAppType';
import EmptyState from '../components/ui/EmptyState';

const statusColor = {
  SENT: '#166534',
  FAILED: '#b91c1c',
  SKIPPED: 'var(--text-dim)',
  PENDING: '#92400e',
};

const Notifications = () => {
  const navigate = useNavigate();
  const { isGuestHouse } = useAppType();
  const { notifications, refresh: refreshActivity } = useNotifications();
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await client.get('/core/notifications/');
      setLogs(normalizeList(res.data));
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Failed to load SMS log');
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshActivity(), fetchLogs()]);
    setRefreshing(false);
  };

  const handleActivityClick = (n) => {
    if (n.type === 'payment' || n.type === 'payment_due') {
      const payPath = isGuestHouse ? '/gh/payments' : '/payments';
      const id = n.stayId || n.bookingId;
      navigate(payPath, id ? {
        state: {
          [isGuestHouse ? 'preselectedStayId' : 'preselectedBookingId']: id,
          autoOpenRecord: true,
        },
      } : undefined);
      return;
    }
    if (n.type === 'inventory') {
      navigate(isGuestHouse ? '/gh/inventory' : '/inventory');
      return;
    }
    if (n.stayId) {
      navigate(`/gh/stays/${n.stayId}`);
      return;
    }
    if (n.bookingId) {
      navigate(
        isGuestHouse ? `/gh/stays/${n.bookingId}` : '/bookings',
        isGuestHouse ? undefined : { state: { editBookingId: n.bookingId } }
      );
    }
  };

  const filteredLogs = logs.filter((l) => filter === 'ALL' || l.status === filter);

  const activityIcon = (type) => {
    if (type === 'inventory') return Package;
    if (type === 'payment' || type === 'payment_due') return Wallet;
    return Calendar;
  };

  const activityIconClass = (type) => {
    if (type === 'inventory') return 'dash-notif-item__icon--inventory';
    if (type === 'payment' || type === 'payment_due') return 'dash-notif-item__icon--payment';
    return 'dash-notif-item__icon--event';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
            {isGuestHouse
              ? 'Upcoming check-ins, balance due, activity, and customer SMS / WhatsApp messages.'
              : 'Alerts, bookings, payments, and customer SMS / WhatsApp messages.'}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          <RefreshCw size={16} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} /> Refresh
        </button>
      </div>

      <section className="card" style={{ marginBottom: '24px', padding: '20px 24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>Activity &amp; alerts</h3>
        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="All caught up"
            description={
              isGuestHouse
                ? 'No upcoming check-ins or payment reminders right now.'
                : 'No upcoming events, payment reminders, or recent bookings/payments.'
            }
          />
        ) : (
          <div className="dash-notif-list">
            {notifications.map((n) => {
              const Icon = activityIcon(n.type);
              return (
                <button
                  key={n.id}
                  type="button"
                  className="dash-notif-item"
                  onClick={() => handleActivityClick(n)}
                >
                  <span className={`dash-notif-item__icon ${activityIconClass(n.type)}`}>
                    {n.icon ? (
                      <span style={{ fontSize: '18px', lineHeight: 1 }} aria-hidden>{n.icon}</span>
                    ) : (
                      <Icon size={18} />
                    )}
                  </span>
                  <span>
                    <p className="dash-notif-item__title">{n.title}</p>
                    <p className="dash-notif-item__desc">{n.desc}</p>
                    {n.timeAgo && (
                      <p style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600', marginTop: '4px' }}>
                        {n.timeAgo}
                      </p>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="card table-scroll" style={{ padding: 0 }}>
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MessageSquare size={20} style={{ color: 'var(--text-muted)' }} />
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>SMS / WhatsApp log</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Messages sent to customers (or skipped if no phone / disabled in Settings).
                </p>
              </div>
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="search-filter-bar__select"
              style={{ minHeight: '36px' }}
            >
              <option value="ALL">All statuses</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="SKIPPED">Skipped</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {loadingLogs ? (
            <AppLoader inline message="Loading SMS log…" />
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: '24px' }}>
              <EmptyState
                icon={MessageSquare}
                title="No SMS log entries yet"
                description="Logs appear when bookings or payments trigger customer SMS/WhatsApp (enable channels in Settings → Notifications)."
              />
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px' }}>When</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px' }}>Type</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px' }}>To</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px' }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: '600' }}>{log.notification_type}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px' }}>{log.recipient}</td>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: statusColor[log.status] || 'var(--text-dim)' }}>
                      {log.status}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', maxWidth: '320px' }}>
                      {log.message}
                      {log.error_message && (
                        <p style={{ fontSize: '11px', color: '#b91c1c', marginTop: '4px' }}>{log.error_message}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
    </div>
  );
};

export default Notifications;
