import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  Wallet,
  CalendarCheck,
  BedDouble,
  Users,
  Plus,
  UserPlus,
  ChevronRight,
  DoorOpen,
  LogIn,
  BarChart3,
} from 'lucide-react';
import '../../styles/dashboard.css';
import { getGuestHouseStats, getGuestHouseAlerts } from '../../api/guesthouse';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import StatCard from '../../components/ui/StatCard';
import StatusBadge from '../../components/ui/StatusBadge';
import { DashboardSkeleton } from '../../components/ui/LoadingSkeleton';
import {
  GhRevenueChart,
  StaysByRoomChart,
  StayStatusChart,
  GhOccupancyHero,
  GhFinancialSnapshot,
} from '../../components/guesthouse/GuestHouseDashboardCharts';
import GhNotificationsPanel from '../../components/guesthouse/GhNotificationsPanel';
import PeriodSelect from '../../components/dashboard/PeriodSelect';
import { getGreeting, revenueTrendPercent } from '../../utils/dashboard';
import { formatRs } from '../../utils/currency';
import EmptyState from '../../components/ui/EmptyState';
import toast from 'react-hot-toast';
import { useGhPageVisibility } from '../../context/GhPageVisibilityContext';
import { GH_PAGE_KEYS } from '../../constants/ghPages';

const DASHBOARD_POLL_MS = 30_000;

const EMPTY_STATS = {
  total_rooms: 0,
  active_rooms: 0,
  occupied_today: 0,
  occupancy_rate: 0,
  total_revenue: 0,
  total_expenses: 0,
  net_profit: 0,
  total_stays: 0,
  pending_payments: 0,
  pending_stays: 0,
  upcoming_checkins: 0,
  check_ins_today: 0,
  revenue_growth: [],
  stays_by_room: [],
  stays_by_status: [],
  recent_stays: [],
  recent_payments: [],
};

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const formatStayDates = (checkIn, checkOut) => {
  try {
    const inD = format(parseISO(checkIn), 'dd MMM');
    const outD = format(parseISO(checkOut), 'dd MMM yyyy');
    return `${inD} → ${outD}`;
  } catch {
    return `${checkIn || '-'} → ${checkOut || '-'}`;
  }
};

const normalizeStats = (data) => ({
  ...EMPTY_STATS,
  ...(data && typeof data === 'object' ? data : {}),
  total_revenue: toNum(data?.total_revenue),
  total_expenses: toNum(data?.total_expenses),
  net_profit: toNum(data?.net_profit ?? toNum(data?.total_revenue) - toNum(data?.total_expenses)),
  pending_payments: toNum(data?.pending_payments),
  revenue_growth: Array.isArray(data?.revenue_growth) ? data.revenue_growth : [],
  stays_by_room: Array.isArray(data?.stays_by_room) ? data.stays_by_room : [],
  stays_by_status: Array.isArray(data?.stays_by_status) ? data.stays_by_status : [],
  recent_stays: Array.isArray(data?.recent_stays) ? data.recent_stays : [],
  recent_payments: Array.isArray(data?.recent_payments) ? data.recent_payments : [],
});

export default function GuestHouseOverview() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { canOperate, canAccessPayments, canAccessReports } = usePermissions();
  const { isPageVisible } = useGhPageVisibility();
  const showReports = canAccessReports && isPageVisible(GH_PAGE_KEYS.REPORTS);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [alerts, setAlerts] = useState({ upcoming_checkins: [], payment_due: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [period, setPeriod] = useState('today');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });
  const mounted = useRef(true);
  const refreshRef = useRef(() => {});

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'there';

  const revenueTrend = useMemo(
    () => revenueTrendPercent(stats.revenue_growth),
    [stats.revenue_growth],
  );

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getGuestHouseAlerts();
      if (mounted.current) setAlerts(data);
    } catch {
      /* optional */
    }
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
        const data = await getGuestHouseStats(params);
        if (mounted.current) {
          setStats(normalizeStats(data));
          setLastUpdated(new Date());
          setLoadError(null);
        }
        return true;
      } catch (err) {
        const msg = err.response?.data?.detail || err.message || 'Could not load dashboard.';
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
    [period, customDates.start, customDates.end],
  );

  const refreshDashboard = useCallback(
    async ({ silent = true } = {}) => {
      await Promise.allSettled([fetchStats({ silent }), fetchAlerts()]);
    },
    [fetchStats, fetchAlerts],
  );

  refreshRef.current = refreshDashboard;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

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

  if (authLoading || (isLoading && !lastUpdated)) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="dash-page">
      {loadError && (
        <div role="alert" className="dash-error-banner">
          <span>{loadError}</span>
          <button type="button" className="dash-btn dash-btn--secondary dash-btn--sm" onClick={() => refreshRef.current({ silent: false })}>
            Retry
          </button>
        </div>
      )}

      <header className="dash-header">
        <div>
          <p className="dash-header__greeting">{getGreeting()}, {displayName}</p>
          <h1 className="dash-header__title">Guest House Dashboard</h1>
          <p className="dash-header__subtitle">
            Occupancy, collections, stays, and room performance - live overview.
          </p>
        </div>
        <div className="dash-header__meta">
          {lastUpdated && (
            <span className="dash-live-badge" title="Refreshes every 5 seconds">
              <span className={`dash-live-badge__dot ${isRefreshing ? 'dash-live-badge__dot--pulse' : ''}`} />
              {isRefreshing ? 'Updating…' : `Live · ${lastUpdated.toLocaleTimeString()}`}
            </span>
          )}
          {period === 'custom' && (
            <div className="dash-date-range">
              <input type="date" value={customDates.start} onChange={(e) => setCustomDates((p) => ({ ...p, start: e.target.value }))} aria-label="Start date" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
              <input type="date" value={customDates.end} onChange={(e) => setCustomDates((p) => ({ ...p, end: e.target.value }))} aria-label="End date" />
            </div>
          )}
          <PeriodSelect value={period} onChange={setPeriod} aria-label="Report period" />
        </div>
      </header>

      <section className="gh-dash-hero" aria-label="Today at a glance">
        <div>
          <p className="gh-dash-hero__eyebrow">Guest house · live</p>
          <h2 className="gh-dash-hero__title">
            {stats.occupied_today > 0
              ? `${stats.occupied_today} room${stats.occupied_today !== 1 ? 's' : ''} occupied right now`
              : 'Rooms available today'}
          </h2>
          <p className="gh-dash-hero__subtitle">
            {stats.upcoming_checkins > 0
              ? `${stats.upcoming_checkins} upcoming check-in${stats.upcoming_checkins !== 1 ? 's' : ''} · `
              : ''}
            {stats.pending_stays > 0
              ? `${stats.pending_stays} stay${stats.pending_stays !== 1 ? 's' : ''} awaiting confirmation`
              : 'Operations look clear - great day to welcome guests.'}
          </p>
        </div>
        <div className="gh-dash-hero__chips">
          <div className="gh-dash-hero__chip">
            <span className="gh-dash-hero__chip-value">{stats.occupancy_rate}%</span>
            <span className="gh-dash-hero__chip-label">Occupancy</span>
          </div>
          <div className="gh-dash-hero__chip">
            <span className="gh-dash-hero__chip-value">{formatRs(stats.total_revenue)}</span>
            <span className="gh-dash-hero__chip-label">Collections</span>
          </div>
          <div className="gh-dash-hero__chip">
            <span className="gh-dash-hero__chip-value">{formatRs(stats.net_profit)}</span>
            <span className="gh-dash-hero__chip-label">Net (period)</span>
          </div>
        </div>
      </section>

      <div className="dash-quick-actions">
        {canOperate && (
          <button type="button" className="dash-btn dash-btn--primary" onClick={() => navigate('/gh/book')}>
            <Plus size={16} /> Book future stay
          </button>
        )}
        {canOperate && (
          <button type="button" className="dash-btn dash-btn--secondary" onClick={() => navigate('/gh/customers', { state: { openCreate: true } })}>
            <UserPlus size={16} /> Add customer
          </button>
        )}
        {canAccessPayments && (
          <button type="button" className="dash-btn dash-btn--secondary" onClick={() => navigate('/gh/payments/new')}>
            <Wallet size={16} /> Record payment
          </button>
        )}
        <button type="button" className="dash-btn dash-btn--secondary" onClick={() => navigate('/gh/calendar')}>
          <CalendarCheck size={16} /> Calendar
        </button>
        {showReports && (
          <button type="button" className="dash-btn dash-btn--secondary" onClick={() => navigate('/gh/reports')}>
            <BarChart3 size={16} /> Reports
          </button>
        )}
      </div>

      <section className="dash-kpi-grid" aria-label="Key metrics">
        <StatCard
          label="Total collections"
          value={stats.total_revenue}
          icon={Wallet}
          isCurrency
          trend={revenueTrend}
          variant="primary"
          to={canAccessPayments ? '/gh/payments' : undefined}
          hint={stats.net_profit != null ? `Net Rs ${Number(stats.net_profit).toLocaleString()}` : undefined}
        />
        <StatCard
          label="Total stays"
          value={stats.total_stays}
          icon={CalendarCheck}
          variant="primary"
          to="/gh/stays"
          hint="In selected period"
        />
        <StatCard
          label="Balance due"
          value={stats.pending_payments}
          icon={Users}
          isCurrency
          showZeroAs00
          variant="warning"
          to="/gh/payments"
          hint="Outstanding from guests"
        />
        <StatCard
          label="Occupied today"
          value={`${stats.occupied_today}/${stats.active_rooms}`}
          icon={DoorOpen}
          variant="info"
          to="/gh/calendar"
          hint={`${stats.occupancy_rate}% occupancy`}
        />
      </section>

      <section className="dash-kpi-grid dash-kpi-grid--secondary" aria-label="Secondary metrics">
        <StatCard label="Pending stays" value={stats.pending_stays} icon={CalendarCheck} variant="warning" to="/gh/stays" />
        <StatCard label="Check-ins today" value={stats.check_ins_today} icon={LogIn} variant="success" to="/gh/calendar" />
        <StatCard label="Upcoming check-ins" value={stats.upcoming_checkins} icon={BedDouble} variant="info" to="/gh/calendar" />
        <StatCard label="Active rooms" value={stats.active_rooms} icon={BedDouble} variant="primary" to="/gh/settings?tab=rooms" hint={`${stats.total_rooms} total rooms`} />
      </section>

      <section className="dash-charts-row" aria-label="Analytics">
        <GhRevenueChart data={stats.revenue_growth} />
        <StaysByRoomChart data={stats.stays_by_room} />
      </section>

      <section className="dash-charts-row dash-charts-row--triple" style={{ marginTop: 0 }}>
        <GhOccupancyHero rate={stats.occupancy_rate} occupied={stats.occupied_today} total={stats.active_rooms} />
        <StayStatusChart data={stats.stays_by_status} />
        <GhFinancialSnapshot revenue={stats.total_revenue} expenses={stats.total_expenses} />
      </section>

      <section className="dash-bottom-grid">
        <article className="dash-panel">
          <header className="dash-panel__head">
            <h3 className="dash-panel__title">Recent stays</h3>
            <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => navigate('/gh/stays')}>
              View all <ChevronRight size={14} />
            </button>
          </header>
          {stats.recent_stays.length === 0 ? (
            <EmptyState
              icon={BedDouble}
              title="No stays yet"
              description="Create your first stay booking to see activity here."
            />
          ) : (
            <div className="dash-stay-list">
              {stats.recent_stays.map((s) => {
                const initial = (s.customer_name || '?')[0]?.toUpperCase();
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="dash-stay-row"
                    onClick={() => navigate(`/gh/stays/${s.id}`)}
                  >
                    <span className="dash-stay-row__avatar">{initial}</span>
                    <div className="dash-stay-row__body">
                      <p className="dash-stay-row__name">{s.customer_name || 'Guest'}</p>
                      <p className="dash-stay-row__meta">
                        {s.booking_ref && <span className="dash-stay-row__ref">{s.booking_ref}</span>}
                        Room {s.room_number} · {formatStayDates(s.check_in, s.check_out)}
                      </p>
                    </div>
                    <span className="dash-stay-row__status">
                      <StatusBadge status={s.status} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </article>

        {canAccessPayments ? (
          <article className="dash-panel">
            <header className="dash-panel__head">
              <h3 className="dash-panel__title">Latest payments</h3>
              <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => navigate('/gh/payments')}>
                View all <ChevronRight size={14} />
              </button>
            </header>
            {stats.recent_payments.length === 0 ? (
              <EmptyState icon={Wallet} title="No payments yet" description="Recorded payments appear here." />
            ) : (
              <div className="dash-payment-list">
                {stats.recent_payments.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="dash-payment-row"
                    onClick={() => navigate('/gh/payments')}
                  >
                    <div>
                      <p className="dash-table__cell-primary">
                        {p.booking_ref || `Payment #${p.id}`}
                      </p>
                      <p className="dash-table__cell-muted">
                        {p.customer_name} · Room {p.room_number} · {p.payment_method}
                      </p>
                    </div>
                    <span className="dash-payment-row__amount">{formatRs(p.amount)}</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        ) : null}

        <GhNotificationsPanel alerts={alerts} />
      </section>
    </div>
  );
}
