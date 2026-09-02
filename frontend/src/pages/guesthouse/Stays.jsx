import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, differenceInCalendarDays, isSameDay, addDays,
} from 'date-fns';
import {
  Plus, Eye, Pencil, Printer, CalendarCheck,
  BedDouble, Wallet, CreditCard, CalendarDays, User, XCircle,
  ChevronLeft, ChevronRight, Archive,
} from 'lucide-react';
import CancelStayModal from '../../components/guesthouse/CancelStayModal';
import SearchInput from '../../components/SearchInput';
import DataTable from '../../components/ui/DataTable';
import ErpPageShell from '../../components/ui/ErpPageShell';
import { listStays } from '../../api/guesthouse';
import toast from 'react-hot-toast';
import AppLoader from '../../components/AppLoader';
import { usePermissions } from '../../hooks/usePermissions';
import StatusBadge from '../../components/ui/StatusBadge';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import { formatRs, formatCollectDuePKR, hasCollectDue } from '../../utils/currency';
import { canCancelGhStay } from '../../utils/ghStay';
import { stayActiveOnDay, todayISO } from '../../utils/ghDate';
import '../../styles/dashboard.css';
import './stays-list.css';

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'pending', label: 'Pending' },
  { id: 'balance_due', label: 'Due' },
];

const STAY_COLUMNS = [
  { key: 'booking_ref', label: 'Ref', sortable: true },
  { key: 'customer_name', label: 'Customer', sortable: true },
  { key: 'room_number', label: 'Room', sortable: true },
  { key: 'check_in', label: 'Check-in', sortable: true },
  { key: 'check_out', label: 'Check-out', sortable: true },
  { key: 'nights', label: 'Nights', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'payment_status', label: 'Payment', sortable: true },
  { key: 'total_amount', label: 'Total', sortable: true },
  { key: 'advance_paid', label: 'Paid', sortable: true },
  { key: 'due', label: 'Due', sortable: true },
];

const formatStayDate = (d) => {
  if (!d) return '-';
  try {
    return format(parseISO(d), 'dd MMM yyyy');
  } catch {
    return d;
  }
};

const stayNights = (checkIn, checkOut) => {
  try {
    return Math.max(differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)), 1);
  } catch {
    return 0;
  }
};

const formatDayHeading = (dateStr, todayStr) => {
  if (!dateStr) return 'No date';
  try {
    const d = parseISO(dateStr);
    const today = parseISO(todayStr);
    const base = format(d, 'dd MMM yyyy');
    if (isSameDay(d, today)) return `Today · ${base}`;
    if (isSameDay(d, addDays(today, 1))) return `Tomorrow · ${base}`;
    if (isSameDay(d, addDays(today, -1))) return `Yesterday · ${base}`;
    return format(d, 'EEEE, dd MMM yyyy');
  } catch {
    return dateStr;
  }
};

const GuestHouseStays = () => {
  const navigate = useNavigate();
  const { canOperate, canAccessPayments, canCancelStay } = usePermissions();
  const [stays, setStays] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState(null);
  const today = todayISO();

  const isSearching = searchQuery.trim().length > 0;

  const load = async () => {
    setLoading(true);
    try {
      setStays(await listStays());
    } catch {
      toast.error('Failed to load stays');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const getDue = useCallback((s) => (
    s.status === 'CANCELLED'
      ? 0
      : Math.max(0, Number(s.total_amount) - Number(s.advance_paid))
  ), []);

  const matchesFilter = (s, filterId) => {
    const due = getDue(s);
    if (filterId === 'upcoming') {
      return s.check_in >= today && !['CANCELLED', 'CHECKED_OUT'].includes(s.status);
    }
    if (filterId === 'pending') return s.status === 'PENDING';
    if (filterId === 'balance_due') {
      return due > 0 && !['CANCELLED', 'CHECKED_OUT'].includes(s.status);
    }
    return true;
  };

  const scopeStays = useMemo(() => {
    if (isSearching) return stays;
    return stays.filter((s) => stayActiveOnDay(s, selectedDate));
  }, [stays, isSearching, selectedDate]);

  const metrics = useMemo(() => {
    const active = scopeStays.filter((s) => s.status !== 'CANCELLED');
    const upcoming = active.filter((s) => s.check_in >= today && !['CHECKED_OUT'].includes(s.status));
    const checkedIn = active.filter((s) => s.status === 'CHECKED_IN');
    const totalDue = active.reduce((sum, s) => sum + getDue(s), 0);
    return {
      total: active.length,
      upcoming: upcoming.length,
      checkedIn: checkedIn.length,
      totalDue,
    };
  }, [scopeStays, today, getDue]);

  const tabCounts = useMemo(() => {
    const counts = {};
    FILTER_TABS.forEach((tab) => {
      counts[tab.id] = scopeStays.filter((s) => matchesFilter(s, tab.id)).length;
    });
    return counts;
  }, [scopeStays, today]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopeStays
      .filter((s) => {
        const matchesSearch = !q || (
          (s.booking_ref || '').toLowerCase().includes(q)
          || (s.customer_name || '').toLowerCase().includes(q)
          || (s.room_number || '').toLowerCase().includes(q)
          || (s.customer_phone || '').toLowerCase().includes(q)
        );
        return matchesSearch && matchesFilter(s, activeFilter);
      })
      .map((s) => ({
        ...s,
        due: getDue(s),
        nights: stayNights(s.check_in, s.check_out),
      }))
      .sort((a, b) => {
        const roomCmp = String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true });
        if (roomCmp !== 0) return roomCmp;
        return String(a.booking_ref || '').localeCompare(String(b.booking_ref || ''));
      });
  }, [scopeStays, searchQuery, activeFilter, today, getDue]);

  const shiftDate = (days) => {
    try {
      setSelectedDate(format(addDays(parseISO(selectedDate), days), 'yyyy-MM-dd'));
    } catch {
      /* ignore */
    }
  };

  const resetView = () => {
    setSearchQuery('');
    setActiveFilter('all');
    setSelectedDate(today);
  };

  const openCreate = () => {
    if (!canOperate) {
      toast.error('You do not have permission to create stays.');
      return;
    }
    navigate('/gh/book');
  };

  const openStay = (stay) => navigate(`/gh/stays/${stay.id}`);

  const rowActions = (stay) => {
    const due = getDue(stay);
    const items = [
      { label: 'View', icon: <Eye size={14} />, onClick: () => openStay(stay) },
      { label: 'Print', icon: <Printer size={14} />, onClick: () => navigate(
        stay.status === 'CANCELLED'
          ? `/gh/print/stay/${stay.id}?doc=cancellation`
          : `/gh/print/stay/${stay.id}?doc=advance`,
      ) },
    ];
    if (hasCollectDue(due) && canAccessPayments) {
      items.unshift({
        label: 'Collect payment',
        icon: <CreditCard size={14} />,
        onClick: () => navigate(`/gh/payments/new?stay=${stay.id}`),
      });
    }
    if (canOperate && stay.status !== 'CANCELLED' && stay.status !== 'CHECKED_OUT') {
      items.push({
        label: 'Edit',
        icon: <Pencil size={14} />,
        onClick: () => navigate(`/gh/stays/${stay.id}/edit`),
      });
    }
    if (canCancelStay && canCancelGhStay(stay)) {
      items.push({
        label: 'Cancel stay',
        icon: <XCircle size={14} />,
        danger: true,
        onClick: () => setCancelTarget(stay),
      });
    }
    return items;
  };

  const dayHeading = formatDayHeading(selectedDate, today);
  const isSelectedToday = selectedDate === today;

  const renderCell = (row, key) => {
    if (key === 'check_in' || key === 'check_out') return formatStayDate(row[key]);
    if (key === 'status' || key === 'payment_status') return <StatusBadge status={row[key]} />;
    if (key === 'total_amount' || key === 'advance_paid') return formatRs(row[key]);
    if (key === 'due') {
      return (
        <span style={{ color: hasCollectDue(row.due) ? '#b91c1c' : 'var(--text-muted)', fontWeight: 700 }}>
          {formatCollectDuePKR(row.due)}
        </span>
      );
    }
    return row[key] ?? '—';
  };

  const getSortValue = (row, key) => {
    if (key === 'due' || key === 'total_amount' || key === 'advance_paid' || key === 'nights') {
      return Number(row[key]) || 0;
    }
    if (key === 'check_in' || key === 'check_out') {
      return row[key] || '';
    }
    return row[key];
  };

  return (
    <ErpPageShell
      description="Daily reservations workspace. Search all dates or open All Records for full history."
      actions={(
        <>
          <button type="button" className="btn-secondary" onClick={() => navigate('/gh/settings?tab=records')}>
            <Archive size={18} /> All Records
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/gh/calendar')}>
            <CalendarDays size={18} /> Calendar
          </button>
          {canOperate && (
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Plus size={18} /> Reservation
            </button>
          )}
        </>
      )}
      kpis={(
        <>
          <StatCard label={isSearching ? 'Matches' : 'On this day'} value={metrics.total} icon={BedDouble} variant="primary" />
          <StatCard label="Upcoming" value={metrics.upcoming} icon={CalendarCheck} variant="info" to="/gh/calendar" />
          <StatCard label="Checked in" value={metrics.checkedIn} icon={User} variant="success" />
          <StatCard
            label="Outstanding due"
            value={metrics.totalDue}
            icon={Wallet}
            variant={metrics.totalDue > 0 ? 'danger' : 'info'}
            isCurrency
            to={canAccessPayments ? '/gh/payments' : undefined}
          />
        </>
      )}
      toolbar={(
        <>
          {!isSearching && (
            <div className="stays-date-bar" style={{ marginBottom: 0, border: 'none', padding: 0 }}>
              <button type="button" className="stays-date-bar__nav" onClick={() => shiftDate(-1)} aria-label="Previous day">
                <ChevronLeft size={18} />
              </button>
              <div className="stays-date-bar__center">
                <input
                  type="date"
                  className="stays-date-bar__input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  aria-label="Select day"
                />
                <p className="stays-date-bar__label">{dayHeading}</p>
              </div>
              <button type="button" className="stays-date-bar__nav" onClick={() => shiftDate(1)} aria-label="Next day">
                <ChevronRight size={18} />
              </button>
              {!isSelectedToday && (
                <button type="button" className="btn-secondary stays-date-bar__today" onClick={() => setSelectedDate(today)}>
                  Today
                </button>
              )}
            </div>
          )}
          <div className="search-filter-bar" style={{ margin: 0, flex: 1 }}>
            <div className="search-filter-bar__search">
              <SearchInput
                variant="inset"
                placeholder="Search ref, guest, room, phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="erp-filter-pills">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`erp-filter-pill${activeFilter === tab.id ? ' erp-filter-pill--active' : ''}`}
                >
                  {tab.label}
                  <span className="erp-filter-pill__count">{tabCounts[tab.id] ?? 0}</span>
                </button>
              ))}
            </div>
            {(searchQuery || activeFilter !== 'all' || selectedDate !== today) && (
              <button type="button" className="btn-secondary" onClick={resetView} style={{ flexShrink: 0 }}>
                Reset
              </button>
            )}
          </div>
        </>
      )}
      summary={!isSearching && filtered.length > 0 && (
        <>
          <h4>Day summary</h4>
          <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{dayHeading}</p>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            {filtered.length} reservation{filtered.length !== 1 ? 's' : ''}
            {' · '}
            Due {formatRs(metrics.totalDue)}
          </p>
        </>
      )}
    >
      {isSearching && (
        <p className="stays-search-banner" style={{ marginBottom: 8 }}>
          Searching all dates — clear search to return to daily view ({dayHeading}).
        </p>
      )}

      {loading ? (
        <AppLoader inline message="Loading reservations…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title={isSearching ? 'No stays match your search' : `No stays for ${dayHeading}`}
          description={
            isSearching
              ? 'Try a different name, room, or booking ref.'
              : 'No guests are booked for this day. Pick another date, search, or open All Records.'
          }
          action={
            !isSearching ? (
              <div className="stays-empty-actions">
                <button type="button" className="btn-secondary" onClick={() => navigate('/gh/settings?tab=records')}>
                  <Archive size={16} /> All Records
                </button>
                {canOperate && (
                  <button type="button" className="btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Reservation
                  </button>
                )}
              </div>
            ) : null
          }
        />
      ) : (
        <div className="erp-card erp-card--flat">
          <DataTable
            variant="erp"
            sortable
            showColumnChooser
            pageSize={25}
            columns={STAY_COLUMNS}
            data={filtered}
            renderCell={renderCell}
            getSortValue={getSortValue}
            rowActions={rowActions}
            onRowClick={openStay}
          />
        </div>
      )}

      <CancelStayModal
        stay={cancelTarget}
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={load}
      />
    </ErpPageShell>
  );
};

export default GuestHouseStays;
