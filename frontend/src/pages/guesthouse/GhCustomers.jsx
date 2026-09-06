import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO, addDays, subDays, isSameDay, differenceInCalendarDays } from 'date-fns';
import {
  UserPlus, Mail, Phone, Edit2, Trash2, X, Calendar, MapPin,
  ChevronRight, Wallet, BedDouble, Users, FileText, XCircle,
  ChevronLeft, LogIn, LogOut, CalendarCheck, Eye, ShieldCheck, ShieldX,
} from 'lucide-react';
import CancelStayModal from '../../components/guesthouse/CancelStayModal';
import { canCancelGhStay } from '../../utils/ghStay';
import client from '../../api/client';
import { getGuestHouseDaily } from '../../api/guesthouse';
import toast from 'react-hot-toast';
import AppLoader from '../../components/AppLoader';
import { customerDisplayName, customerInitials, buildCustomerPayload, validateGhCustomerForm } from '../../utils/customer';
import { formatPakPhone, PAK_PHONE_INPUT_MAX_LENGTH, PAK_PHONE_PLACEHOLDER } from '../../utils/phone';
import { formatRs, formatCollectDuePKR, hasCollectDue } from '../../utils/currency';
import { usePermissions } from '../../hooks/usePermissions';
import usePersistentState from '../../hooks/usePersistentState';
import { useGhPageVisibility } from '../../context/GhPageVisibilityContext';
import { GH_MODULE_KEYS } from '../../constants/ghPages';
import SearchInput from '../../components/SearchInput';
import StatusBadge from '../../components/ui/StatusBadge';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import { todayISO } from '../../utils/ghDate';
import CnicScannerPanel from '../../components/guesthouse/CnicScannerPanel';
import { resolveGuestFromIdScan } from '../../utils/idCardCustomer';
import '../../styles/dashboard.css';
import './gh-customers.css';
import './gh-records.css';
import './stays-list.css';

const formatStayDates = (checkIn, checkOut) => {
  try {
    return `${format(parseISO(checkIn), 'dd MMM')} → ${format(parseISO(checkOut), 'dd MMM yyyy')}`;
  } catch {
    return `${checkIn || '-'} → ${checkOut || '-'}`;
  }
};

const DAILY_SECTIONS = [
  { key: 'arrivals', title: 'Check-ins today', icon: LogIn },
  { key: 'in_house', title: 'In-house guests', icon: Users },
  { key: 'departures', title: 'Check-outs today', icon: LogOut },
  { key: 'reservations', title: 'Active reservations', icon: CalendarCheck },
];

const DAILY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'arrivals', label: 'Check-ins' },
  { id: 'in_house', label: 'In-house' },
  { id: 'departures', label: 'Check-outs' },
  { id: 'reservations', label: 'Active' },
];

const LIST_STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'WHITELISTED', label: 'Whitelist' },
  { id: 'BLOCKLISTED', label: 'Blocklist' },
  { id: 'NORMAL', label: 'Normal' },
];

const LIST_STATUS_LABELS = {
  NORMAL: 'Normal',
  WHITELISTED: 'Whitelisted',
  BLOCKLISTED: 'Blocklisted',
};

function stayNights(checkIn, checkOut) {
  try {
    return Math.max(differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)), 1);
  } catch {
    return 0;
  }
}

function formatDailyHeading(dateStr, todayStr) {
  if (!dateStr) return 'Select a date';
  try {
    const d = parseISO(dateStr);
    const today = parseISO(todayStr);
    const base = format(d, 'EEEE, dd MMM yyyy');
    if (isSameDay(d, today)) return `Today · ${base}`;
    if (isSameDay(d, addDays(today, 1))) return `Tomorrow · ${base}`;
    if (isSameDay(d, subDays(today, 1))) return `Yesterday · ${base}`;
    return base;
  } catch {
    return dateStr;
  }
}

function GhDailyStayCard({ stay, onOpen }) {
  const due = stay.status === 'CANCELLED'
    ? 0
    : Math.max(0, Number(stay.total_amount) - Number(stay.advance_paid));
  const nights = stayNights(stay.check_in, stay.check_out);
  const paidPct = Number(stay.total_amount) > 0
    ? Math.min(100, Math.round((Number(stay.advance_paid) / Number(stay.total_amount)) * 100))
    : 0;

  return (
    <article className="stay-card" onClick={onOpen}>
      <div className="stay-card__top">
        <div className="stay-card__top-left">
          <p className="stay-card__ref">{stay.booking_ref}</p>
          <h3 className="stay-card__name">{stay.customer_name || 'Guest'}</h3>
          {stay.customer_phone && (
            <p className="stay-card__phone"><Phone size={11} /> {stay.customer_phone}</p>
          )}
        </div>
        <div className="stay-card__badges">
          <StatusBadge status={stay.status} />
        </div>
      </div>

      <div className="stay-card__body">
        <div className="stay-card__info">
          <div className="stay-card__cell">
            <p className="stay-card__cell-label">Room</p>
            <p className="stay-card__cell-val stay-card__cell-val--room">{stay.room_number}</p>
          </div>
          <div className="stay-card__cell">
            <p className="stay-card__cell-label">Stay</p>
            <p className="stay-card__cell-val">{nights} night{nights !== 1 ? 's' : ''}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              {formatStayDates(stay.check_in, stay.check_out)}
            </p>
          </div>
        </div>

        <div className="stay-card__pay">
          <div className="stay-card__pay-head">
            <span>Payment</span>
            <StatusBadge status={stay.payment_status} />
          </div>
          <div className="stay-card__bar">
            <div
              className="stay-card__bar-fill"
              style={{
                width: `${paidPct}%`,
                background: paidPct >= 100 ? '#22c55e' : 'var(--primary)',
              }}
            />
          </div>
          <div className="stay-card__amounts">
            <div>
              <p className="stay-card__amt-l">Total</p>
              <p className="stay-card__amt-v">{formatRs(stay.total_amount)}</p>
            </div>
            <div>
              <p className="stay-card__amt-l">Paid</p>
              <p className="stay-card__amt-v" style={{ color: '#166534' }}>{formatRs(stay.advance_paid)}</p>
            </div>
            <div>
              <p className="stay-card__amt-l">Due</p>
              <p className="stay-card__amt-v" style={{ color: hasCollectDue(due) ? '#b91c1c' : 'var(--text-muted)' }}>
                {formatCollectDuePKR(due)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="stay-card__foot" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn-secondary" onClick={onOpen}>
          <Eye size={14} /> View stay
        </button>
      </div>
    </article>
  );
}

const emptyCustomer = {
  full_name: '',
  cnic: '',
  email: '',
  phone: '',
  address: '',
};

export default function GhCustomers() {
  const { canOperate, canManage, canAccessPayments, canCancelStay } = usePermissions();
  const { isModuleVisible, isModuleInMaintenance } = useGhPageVisibility();
  const showIdScanner = isModuleVisible(GH_MODULE_KEYS.ID_SCANNER)
    && !isModuleInMaintenance(GH_MODULE_KEYS.ID_SCANNER);
  const [cancelTarget, setCancelTarget] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { customerId: customerIdParam } = useParams();
  const selectedId = customerIdParam ? Number(customerIdParam) : null;

  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewTab, setViewTab] = usePersistentState('guesthouse-customers-view-tab', 'all');
  const [listStatusFilter, setListStatusFilter] = usePersistentState('guesthouse-customers-status-tab', 'all');
  const [dailyDate, setDailyDate] = useState(todayISO());
  const [dailyData, setDailyData] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailySectionFilter, setDailySectionFilter] = usePersistentState('guesthouse-customers-daily-tab', 'all');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState(emptyCustomer);
  const [formErrors, setFormErrors] = useState({});
  const [scanProcessing, setScanProcessing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusNoteDraft, setStatusNoteDraft] = useState('');

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const response = await client.get('/customers/', { params: { primary_only: '1' } });
      setCustomers(response.data.results || response.data || []);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSummary = useCallback(async (customerId) => {
    if (!customerId) return;
    setSummaryLoading(true);
    try {
      const res = await client.get(`/customers/${customerId}/summary/`, {
        params: { app: 'guesthouse' },
      });
      setSummary(res.data);
    } catch {
      toast.error('Failed to load customer details');
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, []);

  useEffect(() => {
    if (viewTab !== 'daily') return undefined;
    let active = true;
    setDailyLoading(true);
    getGuestHouseDaily({ date: dailyDate })
      .then((data) => { if (active) setDailyData(data); })
      .catch(() => { if (active) toast.error('Failed to load daily data'); })
      .finally(() => { if (active) setDailyLoading(false); });
    return () => { active = false; };
  }, [viewTab, dailyDate]);

  useEffect(() => {
    const id = location.state?.selectedCustomerId;
    if (id) {
      navigate(`/gh/customers/${id}`, { replace: true, state: {} });
    }
  }, [location.state?.selectedCustomerId, navigate]);

  useEffect(() => {
    if (location.state?.openCreate && canOperate) {
      handleOpenFormModal();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openCreate, canOperate, navigate, location.pathname]);

  useEffect(() => {
    if (selectedId) fetchSummary(selectedId);
    else setSummary(null);
  }, [selectedId, fetchSummary]);

  useEffect(() => {
    setStatusNoteDraft(summary?.customer?.list_status_note || '');
  }, [summary?.customer?.id, summary?.customer?.list_status_note]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = customers.filter((c) => {
      const statusMatch = listStatusFilter === 'all'
        || (c.list_status || 'NORMAL') === listStatusFilter;
      const name = customerDisplayName(c).toLowerCase();
      const textMatch = (
        name.includes(q)
        || (c.phone || '').includes(q)
        || (c.email || '').toLowerCase().includes(q)
        || (c.cnic || '').includes(q)
      );
      return statusMatch && (!q || textMatch);
    });
    const priority = { BLOCKLISTED: 0, WHITELISTED: 1, NORMAL: 2 };
    return list.sort((a, b) => {
      const pa = priority[a.list_status || 'NORMAL'] ?? 3;
      const pb = priority[b.list_status || 'NORMAL'] ?? 3;
      if (pa !== pb) return pa - pb;
      return customerDisplayName(a).localeCompare(customerDisplayName(b));
    });
  }, [customers, searchQuery, listStatusFilter]);

  const statusCounts = useMemo(() => ({
    all: customers.length,
    NORMAL: customers.filter((c) => (c.list_status || 'NORMAL') === 'NORMAL').length,
    WHITELISTED: customers.filter((c) => c.list_status === 'WHITELISTED').length,
    BLOCKLISTED: customers.filter((c) => c.list_status === 'BLOCKLISTED').length,
  }), [customers]);

  const handleOpenFormModal = (customer = null) => {
    if (!canOperate) {
      toast.error('You do not have permission to modify customers.');
      return;
    }
    if (customer) {
      setCurrentCustomer({
        ...customer,
        full_name: customer.full_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        cnic: customer.cnic || '',
        email: customer.email || '',
      });
      setIsEditing(true);
    } else {
      setCurrentCustomer(emptyCustomer);
      setIsEditing(false);
    }
    setFormErrors({});
    setShowFormModal(true);
  };

  const updateCustomerField = (field, value) => {
    const nextValue = field === 'phone' ? formatPakPhone(value) : value;
    setCurrentCustomer((prev) => ({ ...prev, [field]: nextValue }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleIdScan = async (parsed) => {
    if (scanProcessing || isEditing) return;
    setCurrentCustomer({ ...emptyCustomer });
    setFormErrors({});
    setScanProcessing(true);
    try {
      const result = await resolveGuestFromIdScan(parsed, { customers });
      if (result.status === 'invalid') {
        toast.error('Could not read ID card. Scan again.');
        return;
      }
      if (result.status === 'existing') {
        toast.success(`Guest found: ${customerDisplayName(result.customer)}`);
        setShowFormModal(false);
        await fetchCustomers();
        navigate(`/gh/customers/${result.customer.id}`);
        return;
      }
      if (result.status === 'created') {
        toast.success(`Guest saved: ${customerDisplayName(result.customer)}`);
        setShowFormModal(false);
        setFormErrors({});
        await fetchCustomers();
        navigate(`/gh/customers/${result.customer.id}`);
        return;
      }
      setCurrentCustomer({
        ...emptyCustomer,
        ...result.draft,
      });
      setFormErrors({});
      setShowFormModal(true);
      toast('ID card read — check fields and add phone if missing', { icon: 'ℹ️' });
    } catch {
      toast.error('Failed to process ID card');
    } finally {
      setScanProcessing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateGhCustomerForm(currentCustomer);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fill all required fields.');
      return;
    }
    const payload = buildCustomerPayload(currentCustomer);
    try {
      if (isEditing) {
        await client.put(`/customers/${currentCustomer.id}/`, payload);
        toast.success('Customer updated');
        if (selectedId === currentCustomer.id) fetchSummary(selectedId);
      } else {
        const res = await client.post('/customers/', payload);
        toast.success('Customer added');
        navigate(`/gh/customers/${res.data.id}`);
      }
      setShowFormModal(false);
      setFormErrors({});
      fetchCustomers();
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const apiErrors = {};
        Object.entries(data).forEach(([key, val]) => {
          apiErrors[key] = Array.isArray(val) ? val[0] : String(val);
        });
        if (Object.keys(apiErrors).length > 0) {
          setFormErrors(apiErrors);
          toast.error(apiErrors[Object.keys(apiErrors)[0]] || 'Operation failed');
          return;
        }
      }
      toast.error('Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!canManage) return;
    if (!window.confirm('Delete this customer?')) return;
    try {
      await client.delete(`/customers/${id}/`);
      toast.success('Customer deleted');
      if (selectedId === id) navigate('/gh/customers');
      fetchCustomers();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleListStatusUpdate = async (nextStatus, note = statusNoteDraft) => {
    if (!selectedId || statusUpdating || !canOperate) return;
    if (nextStatus === 'BLOCKLISTED' && String(note || '').trim().length < 8) {
      toast.error('Blocklist reason kam az kam 8 characters ka likhein.');
      return;
    }
    if (nextStatus === 'BLOCKLISTED') {
      const ok = window.confirm('Customer ko blocklist karna hai? Is customer ki new booking block ho jayegi.');
      if (!ok) return;
    }
    setStatusUpdating(true);
    try {
      await client.post(`/customers/${selectedId}/set-list-status/`, {
        list_status: nextStatus,
        list_status_note: note,
      });
      toast.success(`Customer marked as ${LIST_STATUS_LABELS[nextStatus]}`);
      await fetchCustomers();
      await fetchSummary(selectedId);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update list status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const selectedCustomer = summary?.customer || customers.find((c) => c.id === selectedId);
  const today = todayISO();
  const isDailyToday = dailyDate === today;

  const shiftDailyDate = (days) => {
    try {
      setDailyDate(format(addDays(parseISO(dailyDate), days), 'yyyy-MM-dd'));
    } catch {
      /* ignore */
    }
  };

  const dailyTotals = useMemo(() => ({
    reservations: dailyData?.reservations?.length || 0,
    arrivals: dailyData?.arrivals?.length || 0,
    in_house: dailyData?.in_house?.length || 0,
    departures: dailyData?.departures?.length || 0,
  }), [dailyData]);

  const dailyTotalCount = dailyTotals.reservations + dailyTotals.arrivals + dailyTotals.in_house + dailyTotals.departures;
  const dailyHeading = formatDailyHeading(dailyDate, today);

  const visibleDailySections = useMemo(() => {
    const withItems = DAILY_SECTIONS.map((section) => ({
      ...section,
      items: dailyData?.[section.key] || [],
    }));

    if (dailySectionFilter === 'all') {
      return withItems.filter((section) => section.items.length > 0);
    }

    const match = withItems.find((section) => section.key === dailySectionFilter);
    return match ? [match] : [];
  }, [dailyData, dailySectionFilter]);

  const dailyFilterCounts = useMemo(() => ({
    all: dailyTotalCount,
    arrivals: dailyTotals.arrivals,
    in_house: dailyTotals.in_house,
    departures: dailyTotals.departures,
    reservations: dailyTotals.reservations,
  }), [dailyTotalCount, dailyTotals]);

  return (
    <>
      <div className="animate-fade-in gh-cust-page">
        <div className="gh-records-tabs" style={{ marginBottom: '20px' }}>
          <button
            type="button"
            className={`gh-records-tab${viewTab === 'all' ? ' gh-records-tab--active' : ''}`}
            onClick={() => setViewTab('all')}
          >
            All guests
          </button>
          <button
            type="button"
            className={`gh-records-tab${viewTab === 'daily' ? ' gh-records-tab--active' : ''}`}
            onClick={() => setViewTab('daily')}
          >
            Daily view
          </button>
        </div>

        {viewTab === 'daily' ? (
          <div className="gh-daily-view">
            <div className="gh-daily-hero">
              <p className="gh-daily-hero__eyebrow">Guest operations</p>
              <h2 className="gh-daily-hero__title">{dailyHeading}</h2>
              <p className="gh-daily-hero__sub">
                {dailyTotalCount} stay{dailyTotalCount !== 1 ? 's' : ''} scheduled for this day
              </p>
            </div>

            <div className="stays-date-bar">
              <button
                type="button"
                className="stays-date-bar__nav"
                onClick={() => shiftDailyDate(-1)}
                aria-label="Previous day"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="stays-date-bar__center">
                <input
                  id="daily-date"
                  type="date"
                  className="stays-date-bar__input"
                  value={dailyDate}
                  onChange={(e) => setDailyDate(e.target.value)}
                  aria-label="Select date"
                />
                <p className="stays-date-bar__label">{dailyHeading}</p>
              </div>
              <button
                type="button"
                className="stays-date-bar__nav"
                onClick={() => shiftDailyDate(1)}
                aria-label="Next day"
              >
                <ChevronRight size={18} />
              </button>
              {!isDailyToday && (
                <button
                  type="button"
                  className="btn-secondary stays-date-bar__today"
                  onClick={() => setDailyDate(today)}
                >
                  Today
                </button>
              )}
            </div>

            <section className="dash-kpi-grid gh-daily-kpis">
              <StatCard label="Check-ins" value={dailyTotals.arrivals} icon={LogIn} variant="success" />
              <StatCard label="In-house" value={dailyTotals.in_house} icon={Users} variant="info" />
              <StatCard label="Check-outs" value={dailyTotals.departures} icon={LogOut} variant="warning" />
              <StatCard label="Active" value={dailyTotals.reservations} icon={CalendarCheck} variant="primary" />
            </section>

            <div className="stays-filters gh-daily-filters">
              {DAILY_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setDailySectionFilter(filter.id)}
                  className={`stays-filter-pill${dailySectionFilter === filter.id ? ' stays-filter-pill--active' : ''}`}
                >
                  {filter.label}
                  <span className="stays-filter-count">{dailyFilterCounts[filter.id] ?? 0}</span>
                </button>
              ))}
            </div>

            {dailyLoading ? (
              <AppLoader inline message="Loading daily data…" />
            ) : dailyTotalCount === 0 ? (
              <EmptyState
                icon={BedDouble}
                title={`No stays for ${dailyHeading}`}
                description="No guests are scheduled on this date. Pick another day or book a new reservation."
                action={
                  canOperate ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => navigate('/gh/book')}
                      style={{ marginTop: 16 }}
                    >
                      <FileText size={16} /> New reservation
                    </button>
                  ) : null
                }
              />
            ) : visibleDailySections.every((section) => !section.items.length) ? (
              <EmptyState
                icon={Users}
                title="No stays in this group"
                description="Try another filter or pick a different date."
              />
            ) : (
              <div className="stays-day-groups">
                {visibleDailySections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <section key={section.key}>
                      <header className={`stays-day-group__head${isDailyToday && section.key === 'arrivals' ? ' stays-day-group__head--today' : ''}`}>
                        <div>
                          <h3 className="stays-day-group__title">
                            <Icon size={18} style={{ marginRight: 8, verticalAlign: -3 }} aria-hidden />
                            {section.title}
                          </h3>
                          <p className="stays-day-group__sub">
                            {section.items.length} reservation{section.items.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <span className="stays-day-group__badge">{section.items.length}</span>
                      </header>
                      <div className="stays-grid">
                        {section.items.map((stay) => (
                          <GhDailyStayCard
                            key={`${section.key}-${stay.id}`}
                            stay={stay}
                            onOpen={() => navigate(`/gh/stays/${stay.id}`)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
        <div className="gh-cust-layout">
          <div className="gh-cust-list-panel">
            <div className="search-filter-bar" style={{ marginBottom: '14px', padding: '12px 14px' }}>
              <div className="search-filter-bar__search" style={{ minWidth: '100%', flex: 1 }}>
                <SearchInput
                  variant="inset"
                  placeholder="Search name, phone, CNIC, email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="gh-cust-list-filters">
              {LIST_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`gh-cust-list-filter${listStatusFilter === filter.id ? ' gh-cust-list-filter--active' : ''}`}
                  onClick={() => setListStatusFilter(filter.id)}
                >
                  {filter.label}
                  <span className="gh-cust-list-filter__count">
                    {statusCounts[filter.id] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="gh-cust-empty">Loading guests…</div>
            ) : filteredCustomers.length === 0 ? (
              <EmptyState
                icon={Users}
                title={searchQuery ? 'No guests match your search' : 'No guests yet'}
                description={searchQuery ? 'Try a different search term.' : 'Add your first guest to start booking stays.'}
                action={
                  canOperate && !searchQuery ? (
                    <button type="button" className="btn-primary" onClick={() => handleOpenFormModal()} style={{ marginTop: 16 }}>
                      <UserPlus size={16} /> Add first guest
                    </button>
                  ) : null
                }
              />
            ) : (
              <>
                <p className="gh-cust-count">
                  {filteredCustomers.length} primary booker{filteredCustomers.length !== 1 ? 's' : ''}
                </p>
                <div className="gh-cust-list">
                  {filteredCustomers.map((customer) => {
                    const active = selectedId === customer.id;
                    const due = Number(customer.outstanding_balance) || 0;
                    return (
                      <button
                        key={customer.id}
                        type="button"
                        className={`gh-cust-row${active ? ' gh-cust-row--active' : ''}`}
                        onClick={() => navigate(`/gh/customers/${customer.id}`)}
                      >
                        <span className="gh-cust-row__avatar">{customerInitials(customer)}</span>
                        <div className="gh-cust-row__body">
                          <p className="gh-cust-row__name">{customerDisplayName(customer)}</p>
                          {(customer.list_status || 'NORMAL') !== 'NORMAL' && (
                            <span className={`gh-cust-status-badge gh-cust-status-badge--${(customer.list_status || 'NORMAL').toLowerCase()}`}>
                              {LIST_STATUS_LABELS[customer.list_status] || customer.list_status}
                            </span>
                          )}
                          <p className="gh-cust-row__phone">{customer.phone || '-'}</p>
                          <p className={`gh-cust-row__due ${hasCollectDue(due) ? 'gh-cust-row__due--warn' : 'gh-cust-row__due--ok'}`}>
                            Due: {formatCollectDuePKR(due)}
                          </p>
                        </div>
                        <ChevronRight size={18} color={active ? 'var(--primary)' : 'var(--icon-muted)'} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {selectedId ? (
            <div className="gh-cust-detail">
              {summaryLoading ? (
                <AppLoader inline className="app-loader--compact" message="Loading profile…" />
              ) : selectedCustomer ? (
                <>
                  <div className="gh-cust-detail__head">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <h3 className="gh-cust-detail__name">{customerDisplayName(selectedCustomer)}</h3>
                        <p className="gh-cust-detail__sub">Primary booker — click a guest below to open their profile</p>
                        {(selectedCustomer.list_status || 'NORMAL') !== 'NORMAL' && (
                          <span className={`gh-cust-status-badge gh-cust-status-badge--${(selectedCustomer.list_status || 'NORMAL').toLowerCase()}`}>
                            {LIST_STATUS_LABELS[selectedCustomer.list_status] || selectedCustomer.list_status}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {canOperate && (
                          <button type="button" className="btn-secondary" onClick={() => handleOpenFormModal(selectedCustomer)} title="Edit" style={{ padding: '8px 10px' }}>
                            <Edit2 size={16} />
                          </button>
                        )}
                        {canManage && (
                          <button type="button" onClick={() => handleDelete(selectedId)} title="Delete" style={{ padding: '8px 10px', background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8 }}>
                            <Trash2 size={16} />
                          </button>
                        )}
                        <button type="button" onClick={() => navigate('/gh/customers')} title="Close" style={{ padding: '8px 10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="gh-cust-detail__body">
                    <div className="gh-cust-chips">
                      <span className="gh-cust-chip"><Phone size={14} /> {selectedCustomer.phone}</span>
                      <span className="gh-cust-chip"><Mail size={14} /> {selectedCustomer.email || 'No email'}</span>
                      {selectedCustomer.cnic && (
                        <span className="gh-cust-chip" style={{ fontFamily: 'monospace', fontSize: 12 }}>CNIC {selectedCustomer.cnic}</span>
                      )}
                      {selectedCustomer.address && (
                        <span className="gh-cust-chip"><MapPin size={14} /> {selectedCustomer.address}</span>
                      )}
                      <span className="gh-cust-chip">
                        <Calendar size={14} /> Joined {new Date(selectedCustomer.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="gh-cust-list-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={statusUpdating || !canOperate || selectedCustomer.list_status === 'WHITELISTED'}
                        onClick={() => handleListStatusUpdate('WHITELISTED')}
                      >
                        <ShieldCheck size={14} /> Add to whitelist
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={statusUpdating || !canOperate || selectedCustomer.list_status === 'BLOCKLISTED'}
                        onClick={() => handleListStatusUpdate('BLOCKLISTED')}
                        style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                      >
                        <ShieldX size={14} /> Add to blocklist
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={statusUpdating || !canOperate || selectedCustomer.list_status === 'NORMAL'}
                        onClick={() => handleListStatusUpdate('NORMAL')}
                      >
                        Clear status
                      </button>
                    </div>
                    <div className="gh-cust-risk-panel">
                      <p className="gh-cust-risk-panel__title">Whitelist / Blocklist notes</p>
                      <textarea
                        value={statusNoteDraft}
                        onChange={(e) => setStatusNoteDraft(e.target.value)}
                        rows={2}
                        placeholder="Example: Verified corporate client / Repeated no-show / Security concern..."
                        className="gh-cust-risk-panel__input"
                        disabled={!canOperate || statusUpdating}
                      />
                      <div className="gh-cust-risk-panel__actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={!canOperate || statusUpdating}
                          onClick={() => handleListStatusUpdate(selectedCustomer.list_status || 'NORMAL', statusNoteDraft)}
                        >
                          Save note
                        </button>
                      </div>
                    </div>
                    {summary?.customer?.list_status_updated_at && (
                      <p className="gh-cust-risk-panel__audit">
                        Last update: {new Date(summary.customer.list_status_updated_at).toLocaleString()}
                        {summary?.customer?.list_status_updated_by_name
                          ? ` by ${summary.customer.list_status_updated_by_name}`
                          : ''}
                      </p>
                    )}

                    {(summary?.related_guests?.length > 0) && (
                      <div className="gh-cust-related">
                        <p className="gh-cust-stays-title" style={{ marginBottom: 10 }}>
                          <Users size={16} /> Guests who stayed with {customerDisplayName(selectedCustomer)}
                        </p>
                        <div className="gh-cust-related__list">
                          {summary.related_guests.map((guest) => {
                            const key = guest.customer_id || guest.cnic || guest.full_name;
                            if (guest.customer_id) {
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className="gh-cust-related__chip gh-cust-related__chip--link"
                                  onClick={() => navigate(`/gh/customers/${guest.customer_id}`)}
                                >
                                  <span className="gh-cust-related__chip-name">
                                    {guest.full_name}
                                    {guest.is_minor && <span className="gh-cust-related__chip-meta"> (under 18)</span>}
                                  </span>
                                  {guest.is_minor && guest.address && (
                                    <span className="gh-cust-related__chip-meta">{guest.address}</span>
                                  )}
                                  {!guest.is_minor && guest.cnic && (
                                    <span className="gh-cust-related__chip-meta">{guest.cnic}</span>
                                  )}
                                  {guest.stays_together > 1 && (
                                    <span className="gh-cust-related__chip-meta">{guest.stays_together} stays</span>
                                  )}
                                </button>
                              );
                            }
                            return (
                              <span key={key} className="gh-cust-related__chip" title="No saved profile yet">
                                <span className="gh-cust-related__chip-name">
                                  {guest.full_name}
                                  {guest.is_minor && <span className="gh-cust-related__chip-meta"> (under 18)</span>}
                                </span>
                                {guest.is_minor && guest.address && (
                                  <span className="gh-cust-related__chip-meta">{guest.address}</span>
                                )}
                                {!guest.is_minor && guest.cnic && (
                                  <span className="gh-cust-related__chip-meta">{guest.cnic}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="gh-cust-stats">
                      <div className="gh-cust-stat">
                        <p className="gh-cust-stat__label">Total stays</p>
                        <p className="gh-cust-stat__val">{summary?.stays_count ?? 0}</p>
                      </div>
                      <div className="gh-cust-stat">
                        <p className="gh-cust-stat__label">Balance due</p>
                        <p className={`gh-cust-stat__val${hasCollectDue(summary?.total_outstanding) ? ' gh-cust-stat__val--warn' : ''}`}>
                          {formatCollectDuePKR(summary?.total_outstanding)}
                        </p>
                      </div>
                    </div>

                    {canOperate && (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={(selectedCustomer.list_status || 'NORMAL') === 'BLOCKLISTED'}
                        onClick={() => navigate('/gh/book', { state: { prefillCustomer: selectedId } })}
                        style={{ width: '100%', marginBottom: 16, padding: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      >
                        <FileText size={16} />
                        {(selectedCustomer.list_status || 'NORMAL') === 'BLOCKLISTED'
                          ? 'Blocklisted customer - booking disabled'
                          : 'New stay booking'}
                      </button>
                    )}

                    <p className="gh-cust-stays-title"><BedDouble size={16} /> Stay history</p>

                    {!summary?.stays?.length ? (
                      <div className="gh-cust-empty">
                        <BedDouble size={32} style={{ opacity: 0.25, marginBottom: 8 }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>No stays for this guest yet</p>
                        {canOperate && (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => navigate('/gh/book', { state: { prefillCustomer: selectedId } })}
                            style={{ marginTop: 14 }}
                          >
                            Book a stay
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="gh-cust-stays">
                        {summary.stays.map((stay) => {
                          const due = stay.status === 'CANCELLED' ? 0 : (Number(stay.remaining_balance) || 0);
                          return (
                            <div
                              key={stay.id}
                              className="gh-cust-stay"
                              role="button"
                              tabIndex={0}
                              onClick={() => navigate(`/gh/stays/${stay.id}`)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  navigate(`/gh/stays/${stay.id}`);
                                }
                              }}
                            >
                              <div className="gh-cust-stay__top">
                                <div>
                                  <p className="gh-cust-stay__ref">{stay.booking_ref}</p>
                                  <p className="gh-cust-stay__room">Room {stay.room_number}</p>
                                  <p className="gh-cust-stay__dates">{formatStayDates(stay.check_in, stay.check_out)}</p>
                                  {Array.isArray(stay.guests) && stay.guests.length > 0 && (
                                    <div className="gh-cust-stay__guests">
                                      {stay.guests
                                        .filter((g) => !g.is_primary)
                                        .map((g) => (
                                          g.customer ? (
                                            <button
                                              key={`${stay.id}-g-${g.id || g.customer}`}
                                              type="button"
                                              className="gh-cust-stay__guest-link"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/gh/customers/${g.customer}`);
                                              }}
                                            >
                                              {g.full_name}
                                            </button>
                                          ) : (
                                            <span key={`${stay.id}-g-${g.id || g.full_name}`} className="gh-cust-stay__guest-tag">
                                              {g.full_name}
                                            </span>
                                          )
                                        ))}
                                    </div>
                                  )}
                                </div>
                                <StatusBadge status={stay.status} />
                              </div>
                              <div className="gh-cust-stay__amounts">
                                <div>
                                  <p className="gh-cust-stay__amt-l">Total</p>
                                  <p className="gh-cust-stay__amt-v">{formatRs(stay.total_amount)}</p>
                                </div>
                                <div>
                                  <p className="gh-cust-stay__amt-l">Paid</p>
                                  <p className="gh-cust-stay__amt-v" style={{ color: '#166534' }}>{formatRs(stay.advance_paid)}</p>
                                </div>
                                <div>
                                  <p className="gh-cust-stay__amt-l">Due</p>
                                  <p className="gh-cust-stay__amt-v" style={{ color: hasCollectDue(due) ? '#b91c1c' : 'var(--text-muted)' }}>
                                    {formatCollectDuePKR(due)}
                                  </p>
                                </div>
                              </div>
                              {canAccessPayments && hasCollectDue(due) && (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/gh/payments/new?stay=${stay.id}`);
                                  }}
                                  style={{ marginTop: 12, width: '100%', padding: 10, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8 }}
                                >
                                  <Wallet size={14} /> Collect {formatCollectDuePKR(due)}
                                </button>
                              )}
                              {canCancelStay && canCancelGhStay(stay) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCancelTarget(stay);
                                  }}
                                  style={{
                                    marginTop: 10,
                                    width: '100%',
                                    padding: 10,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    borderRadius: 8,
                                    background: '#fef2f2',
                                    color: '#b91c1c',
                                    border: '1px solid #fecaca',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <XCircle size={14} /> Cancel stay
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="gh-cust-detail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
              <EmptyState
                icon={Users}
                title="Select a guest"
                description="Choose a guest from the list to view their profile and stay history."
              />
            </div>
          )}
        </div>
        )}
      </div>

      {showFormModal && (
        <div className="gh-cust-modal-backdrop" onClick={() => setShowFormModal(false)}>
          <div className="gh-cust-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>{isEditing ? 'Edit Guest' : 'Add New Guest'}</h3>
              <button type="button" onClick={() => setShowFormModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                <X size={22} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }} noValidate>
              {!isEditing && showIdScanner && (
                <CnicScannerPanel onScan={handleIdScan} disabled={scanProcessing} />
              )}
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Full name <span style={{ color: '#b91c1c' }}>*</span></label>
                  <input
                    value={currentCustomer.full_name || ''}
                    onChange={(e) => updateCustomerField('full_name', e.target.value)}
                    placeholder="Guest full name"
                    aria-invalid={!!formErrors.full_name}
                  />
                  {formErrors.full_name && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{formErrors.full_name}</p>}
                </div>
                <div className="input-group">
                  <label>CNIC <span style={{ color: '#b91c1c' }}>*</span></label>
                  <input
                    value={currentCustomer.cnic || ''}
                    onChange={(e) => updateCustomerField('cnic', e.target.value)}
                    placeholder="35202-1234567-9"
                    style={{ fontFamily: 'monospace' }}
                    aria-invalid={!!formErrors.cnic}
                  />
                  {formErrors.cnic && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{formErrors.cnic}</p>}
                </div>
              </div>
              <div className="input-group">
                <label>Email <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input
                  type="email"
                  value={currentCustomer.email || ''}
                  onChange={(e) => updateCustomerField('email', e.target.value)}
                  aria-invalid={!!formErrors.email}
                />
                {formErrors.email && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{formErrors.email}</p>}
              </div>
              <div className="input-group">
                <label>Phone <span style={{ color: '#b91c1c' }}>*</span></label>
                <input
                  value={currentCustomer.phone}
                  onChange={(e) => updateCustomerField('phone', e.target.value)}
                  placeholder={PAK_PHONE_PLACEHOLDER}
                  inputMode="numeric"
                  maxLength={PAK_PHONE_INPUT_MAX_LENGTH}
                  aria-invalid={!!formErrors.phone}
                />
                {formErrors.phone && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{formErrors.phone}</p>}
              </div>
              <div className="input-group">
                <label>Address <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea value={currentCustomer.address || ''} onChange={(e) => updateCustomerField('address', e.target.value)} rows={2} style={{ width: '100%' }} />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: 13, fontWeight: 700 }}>
                {isEditing ? 'Save changes' : 'Add guest'}
              </button>
            </form>
          </div>
        </div>
      )}

      <CancelStayModal
        stay={cancelTarget}
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={() => {
          if (selectedId) fetchSummary(selectedId);
          fetchCustomers();
        }}
      />
    </>
  );
}
