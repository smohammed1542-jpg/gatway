import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  Calendar,
  Building2,
  Users,
  Plus,
  UserPlus,
  CreditCard,
  Eye,
  Pencil,
  ChevronRight,
  TrendingUp,
  BarChart3,
} from 'lucide-react';

import '../../styles/dashboard.css';
import { getDashboardStats } from '../../api/dashboard';
import { getAlerts } from '../../api/core';
import { getPayments } from '../../api/finance';
import { getVenues } from '../../api/venues';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import StatCard from '../../components/ui/StatCard';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { DashboardSkeleton } from '../../components/ui/LoadingSkeleton';
import {
  RevenueChart,
  BookingTrendChart,
  OccupancyChart,
} from '../../components/dashboard/DashboardCharts';
import NotificationsPanel from '../../components/dashboard/NotificationsPanel';
import PeriodSelect from '../../components/dashboard/PeriodSelect';
import {
  getGreeting,
  revenueTrendPercent,
  unwrapList,
} from '../../utils/dashboard';
import { formatRs } from '../../utils/currency';
import EmptyState from '../../components/ui/EmptyState';
import toast from 'react-hot-toast';

/** Realtime refresh interval while dashboard tab is visible */
const DASHBOARD_POLL_MS = 30_000;

const EMPTY_STATS = {
  total_revenue: 0,
  total_bookings: 0,
  total_expenses: 0,
  pending_payments: 0,
  net_profit: 0,
  revenue_growth: [],
  bookings_by_hall: [],
  recent_bookings: [],
};

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeDashboardStats = (data) => ({
  ...EMPTY_STATS,
  ...(data && typeof data === 'object' ? data : {}),
  total_revenue: toNum(data?.total_revenue),
  total_bookings: toNum(data?.total_bookings),
  total_expenses: toNum(data?.total_expenses),
  pending_payments: toNum(data?.pending_payments),
  net_profit: toNum(data?.net_profit ?? toNum(data?.total_revenue) - toNum(data?.total_expenses)),
  revenue_growth: Array.isArray(data?.revenue_growth) ? data.revenue_growth : [],
  bookings_by_hall: Array.isArray(data?.bookings_by_hall) ? data.bookings_by_hall : [],
  recent_bookings: Array.isArray(data?.recent_bookings) ? data.recent_bookings : [],
});

export default function Overview() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { canAccessPayments, canAccessReports } = usePermissions();
  const [stats, setStats] = useState(EMPTY_STATS);
  const [venues, setVenues] = useState([]);
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [period, setPeriod] = useState('today');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const [alerts, setAlerts] = useState({
    upcoming_events: [],
    payment_due: [],
    inventory_alerts: [],
  });
  const mounted = useRef(true);
  const refreshRef = useRef(() => {});

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'there';

  const activeHalls = useMemo(
    () => venues.filter((v) => v.status === 'ACTIVE').length,
    [venues]
  );

  const revenueTrend = useMemo(
    () => revenueTrendPercent(stats.revenue_growth),
    [stats.revenue_growth]
  );

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAlerts();
      if (mounted.current) setAlerts(data);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  }, []);

  const fetchExtras = useCallback(async () => {
    try {
      const [venueData, payData] = await Promise.all([
        getVenues(),
        getPayments(),
      ]);
      if (mounted.current) {
        setVenues(unwrapList(venueData));
        const list = unwrapList(payData)
          .filter((p) => p.status === 'COMPLETED')
          .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
          .slice(0, 8);
        setPayments(list);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard extras:', err);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchStats = useCallback(
    async ({ silent = false } = {}) => {
      const params = { period };
      if (period === 'custom' && customDates.start && customDates.end) {
        params.start_date = customDates.start;
        params.end_date = customDates.end;
      }
      if (period === 'custom' && (!customDates.start || !customDates.end)) {
        if (!silent && mounted.current) setIsLoading(false);
        return false;
      }

      if (silent) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const data = await getDashboardStats(params);
        if (mounted.current) {
          setStats(normalizeDashboardStats(data));
          setLastUpdated(new Date());
          setLoadError(null);
        }
        return true;
      } catch (err) {
        console.error('Failed to fetch stats:', err);
        const msg =
          err.response?.data?.detail ||
          err.message ||
          'Could not load dashboard. Is the backend running?';
        if (mounted.current) {
          setLoadError(msg);
          if (!silent) toast.error(msg);
        }
        return false;
      } finally {
        if (mounted.current) {
          if (silent) setIsRefreshing(false);
          else setIsLoading(false);
        }
      }
    },
    [period, customDates.start, customDates.end]
  );

  /** Refresh all dashboard APIs (stats, alerts, payments, venues) */
  const refreshDashboard = useCallback(
    async ({ silent = true } = {}) => {
      const results = await Promise.allSettled([
        fetchStats({ silent }),
        fetchAlerts(),
        fetchExtras(),
      ]);
      const statsFailed = results[0].status === 'rejected' || results[0].value === false;
      if (statsFailed && mounted.current && !silent) {
        setLoadError((prev) => prev || 'Dashboard stats could not be loaded.');
      }
    },
    [fetchStats, fetchAlerts, fetchExtras]
  );

  refreshRef.current = refreshDashboard;

  /* Load after login - never skip initial fetch due to document.hidden */
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    refreshRef.current({ silent: false });
  }, [authLoading, isAuthenticated, period, customDates.start, customDates.end]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    const id = setInterval(() => {
      if (!document.hidden) refreshRef.current({ silent: true });
    }, DASHBOARD_POLL_MS);
    return () => clearInterval(id);
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    const onVisible = () => {
      if (!document.hidden) refreshRef.current({ silent: true });
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authLoading, isAuthenticated]);

  const recentRows = useMemo(
    () =>
      stats.recent_bookings.map((b) => ({
        id: b.id,
        customer: b.customer,
        event: b.event,
        status: b.status,
      })),
    [stats.recent_bookings]
  );

  if (authLoading || (isLoading && !lastUpdated)) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="dash-page">
      {loadError && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--error)',
            background: 'var(--color-danger-muted)',
            color: 'var(--error)',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span>{loadError}</span>
          <button
            type="button"
            className="dash-btn dash-btn--secondary dash-btn--sm"
            onClick={() => refreshRef.current({ silent: false })}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Top: greeting + period ── */}
      <header className="dash-header">
        <div>
          <p className="dash-header__greeting">
            {getGreeting()}, {displayName}
          </p>
          <h1 className="dash-header__title">Dashboard</h1>
          <p className="dash-header__subtitle">
            Revenue, bookings, collections, and hall performance at a glance.
          </p>
        </div>
        <div className="dash-header__meta">
          {lastUpdated && (
            <span className="dash-live-badge" title="Live data - refreshes every 5 seconds">
              <span
                className={`dash-live-badge__dot ${isRefreshing ? 'dash-live-badge__dot--pulse' : ''}`}
              />
              {isRefreshing ? 'Updating…' : `Live · ${lastUpdated.toLocaleTimeString()}`}
            </span>
          )}
          {period === 'custom' && (
            <div className="dash-date-range">
              <input
                type="date"
                value={customDates.start}
                onChange={(e) =>
                  setCustomDates((prev) => ({ ...prev, start: e.target.value }))
                }
                aria-label="Start date"
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
              <input
                type="date"
                value={customDates.end}
                onChange={(e) =>
                  setCustomDates((prev) => ({ ...prev, end: e.target.value }))
                }
                aria-label="End date"
              />
            </div>
          )}
          <PeriodSelect value={period} onChange={setPeriod} aria-label="Report period" />
        </div>
      </header>

      {/* ── Quick actions ── */}
      <div className="dash-quick-actions">
        <button
          type="button"
          className="dash-btn dash-btn--primary"
          onClick={() => navigate('/bookings', { state: { openCreate: true } })}
        >
          <Plus size={16} /> Add booking
        </button>
        <button
          type="button"
          className="dash-btn dash-btn--secondary"
          onClick={() => navigate('/customers', { state: { openCreate: true } })}
        >
          <UserPlus size={16} /> Add customer
        </button>
        {canAccessPayments && (
          <button
            type="button"
            className="dash-btn dash-btn--secondary"
            onClick={() => navigate('/payments', { state: { autoOpenRecord: true } })}
          >
            <CreditCard size={16} /> Record payment
          </button>
        )}
        {canAccessReports && (
          <button
            type="button"
            className="dash-btn dash-btn--secondary"
            onClick={() => navigate('/reports')}
          >
            <BarChart3 size={16} /> Reports
          </button>
        )}
      </div>

      {/* ── KPI cards ── */}
      <section className="dash-kpi-grid" aria-label="Key metrics">
        <StatCard
          label="Total revenue"
          value={stats.total_revenue}
          icon={Wallet}
          isCurrency
          trend={revenueTrend}
          variant="primary"
          to={canAccessPayments ? '/payments' : undefined}
          hint={
            stats.net_profit != null
              ? `Net profit Rs ${Number(stats.net_profit).toLocaleString()}`
              : undefined
          }
        />
        <StatCard
          label="Total bookings"
          value={stats.total_bookings}
          icon={Calendar}
          variant="primary"
          to="/bookings"
          hint="Events in selected period"
        />
        <StatCard
          label="Pending collections"
          value={stats.pending_payments}
          icon={Users}
          isCurrency
          showZeroAs00
          variant="warning"
          to={canAccessPayments ? '/payments' : undefined}
          state={canAccessPayments ? { focusPending: true } : undefined}
          hint="Outstanding balance"
        />
        <StatCard
          label="Active halls"
          value={activeHalls}
          icon={Building2}
          variant="primary"
          to="/settings?tab=halls"
          hint={`${venues.length} total venues`}
        />
      </section>

      {/* ── Charts ── */}
      <section className="dash-charts-row" aria-label="Analytics">
        <RevenueChart data={stats.revenue_growth} />
        <BookingTrendChart data={stats.bookings_by_hall} />
      </section>

      <section className="dash-charts-row" style={{ marginTop: 0 }}>
        <OccupancyChart
          bookingsByHall={stats.bookings_by_hall}
          venues={venues}
        />
        <ChartCardNetProfit expenses={stats.total_expenses} revenue={stats.total_revenue} />
      </section>

      {/* ── Bottom: tables + notifications ── */}
      <section className="dash-bottom-grid">
        <article className="dash-panel">
          <header className="dash-panel__head">
            <h3 className="dash-panel__title">Recent bookings</h3>
            <button
              type="button"
              className="dash-btn dash-btn--ghost dash-btn--sm"
              onClick={() => navigate('/bookings')}
            >
              View all <ChevronRight size={14} />
            </button>
          </header>
          <DataTable
            columns={[
              { key: 'customer', label: 'Customer' },
              { key: 'event', label: 'Event' },
              { key: 'status', label: 'Status', width: '120px' },
            ]}
            data={recentRows}
            pageSize={5}
            emptyTitle="No recent bookings"
            emptyDescription="New bookings will show up here automatically."
            onRowClick={(row) =>
              row.id && navigate('/bookings', { state: { editBookingId: row.id } })
            }
            rowActions={(row) => [
              {
                label: 'View',
                icon: <Eye size={14} />,
                onClick: () =>
                  row.id && navigate('/bookings', { state: { editBookingId: row.id } }),
              },
              {
                label: 'Edit',
                icon: <Pencil size={14} />,
                onClick: () =>
                  row.id && navigate('/bookings', { state: { editBookingId: row.id } }),
              },
            ]}
            renderCell={(row, key) => {
              if (key === 'customer') {
                const initial = (row.customer || '?')[0]?.toUpperCase();
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="dash-table__avatar">{initial}</span>
                    <div>
                      <p className="dash-table__cell-primary">{row.customer}</p>
                    </div>
                  </div>
                );
              }
              if (key === 'event') {
                return <span className="dash-table__cell-primary">{row.event}</span>;
              }
              if (key === 'status') {
                return <StatusBadge status={row.status} />;
              }
              return row[key];
            }}
          />
        </article>

        {canAccessPayments ? (
          <article className="dash-panel">
            <header className="dash-panel__head">
              <h3 className="dash-panel__title">Latest payments</h3>
              <button
                type="button"
                className="dash-btn dash-btn--ghost dash-btn--sm"
                onClick={() => navigate('/payments')}
              >
                View all <ChevronRight size={14} />
              </button>
            </header>
            {payments.length === 0 ? (
              <EmptyPayments />
            ) : (
              <div className="dash-payment-list">
                {payments.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="dash-payment-row"
                    onClick={() => navigate('/payments')}
                  >
                    <div>
                      <p className="dash-table__cell-primary">
                        {p.booking_event_name || p.booking_reference || `Payment #${p.id}`}
                      </p>
                      <p className="dash-table__cell-muted">
                        {p.customer_name || '-'} · {p.payment_method}
                      </p>
                    </div>
                    <span className="dash-payment-row__amount">{formatRs(p.amount)}</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        ) : null}

        <NotificationsPanel alerts={alerts} />
      </section>
    </div>
  );
}

function ChartCardNetProfit({ revenue, expenses }) {
  const profit = (parseFloat(revenue) || 0) - (parseFloat(expenses) || 0);
  const margin =
    revenue > 0 ? ((profit / parseFloat(revenue)) * 100).toFixed(1) : '0';

  return (
    <section className="dash-chart-card">
      <header className="dash-chart-card__head">
        <div>
          <h3 className="dash-chart-card__title">Financial snapshot</h3>
          <p className="dash-chart-card__subtitle">Revenue vs expenses (period)</p>
        </div>
        <span
          className="dash-stat-card__trend dash-stat-card__trend--neutral"
          style={{ marginTop: 0 }}
        >
          <TrendingUp size={12} />
          {margin}% margin
        </span>
      </header>
      <div
        className="dash-chart-card__body"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: 'var(--primary-light)',
              border: '1px solid var(--border)',
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Revenue</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>
              {formatRs(revenue)}
            </p>
          </div>
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: 'var(--color-danger-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Expenses</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-danger)', marginTop: 4 }}>
              {formatRs(expenses)}
            </p>
          </div>
        </div>
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Net profit</p>
          <p
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: profit >= 0 ? 'var(--primary)' : 'var(--error)',
              marginTop: 4,
            }}
          >
            {formatRs(profit)}
          </p>
        </div>
      </div>
    </section>
  );
}

function EmptyPayments() {
  return (
    <EmptyState
      icon={Wallet}
      title="No payments yet"
      description="Completed payments appear here in real time."
    />
  );
}
