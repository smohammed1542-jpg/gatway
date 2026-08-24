import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Wallet,
  Plus,
  Trash2,
  Edit2,
  Printer,
  ChevronRight,
  X,
  User,
  BedDouble,
  FileText,
} from 'lucide-react';
import {
  listGhPayments, listStays, deleteGhPayment,
} from '../../api/guesthouse';
import toast from 'react-hot-toast';
import AppLoader from '../../components/AppLoader';
import { usePermissions } from '../../hooks/usePermissions';
import SearchInput from '../../components/SearchInput';
import { formatRs, formatCollectDue, hasCollectDue } from '../../utils/currency';
import { todayISO, matchesDateFilter } from '../../utils/ghDate';
import StatusBadge from '../../components/ui/StatusBadge';
import StatCard from '../../components/ui/StatCard';
import DataTable from '../../components/ui/DataTable';
import AuditMeta from '../../components/ui/AuditMeta';
import useEscapeClose from '../../hooks/useEscapeClose';
import { isLockedPayment } from '../../utils/erp';
import GhFilterSelect, { GH_DATE_FILTER_OPTIONS } from '../../components/guesthouse/GhFilterSelect';
import '../../styles/dashboard.css';

const METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
};

export default function GuestHousePayments() {
  const location = useLocation();
  const navigate = useNavigate();
  const { canOperate, canManage } = usePermissions();

  const [payments, setPayments] = useState([]);
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('today');
  const [filterDate, setFilterDate] = useState(todayISO());
  const [selectedPayment, setSelectedPayment] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([listGhPayments(), listStays()]);
      setPayments(p);
      setStays(s.filter((x) => x.status !== 'CANCELLED'));
    } catch {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const state = location.state;
    if (state?.autoOpenRecord) {
      const stayId = state.preselectedStayId;
      navigate(
        stayId ? `/gh/payments/new?stay=${stayId}` : '/gh/payments/new',
        { replace: true, state: {} },
      );
    }
  }, [location.state, navigate]);

  const metrics = useMemo(() => {
    const completed = payments.filter((p) => p.status === 'COMPLETED');
    const pending = payments.filter((p) => p.status === 'PENDING');
    const totalCollected = completed.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const pendingAmount = pending.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalBilled = stays.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalDue = stays.reduce(
      (sum, s) => sum + Math.max(0, Number(s.total_amount || 0) - Number(s.advance_paid || 0)),
      0,
    );
    return { totalCollected, pendingAmount, totalBilled, totalDue };
  }, [payments, stays]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return payments.filter((p) => {
      const matchesSearch = !q
        || (p.stay_ref || '').toLowerCase().includes(q)
        || (p.customer_name || '').toLowerCase().includes(q)
        || (p.room_number || '').toLowerCase().includes(q)
        || (p.payment_method || '').toLowerCase().includes(q)
        || (p.notes || '').toLowerCase().includes(q)
        || String(p.id).includes(q);
      const matchesMethod = filterMethod === 'ALL' || p.payment_method === filterMethod;
      const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
      const matchesDate = matchesDateFilter(p.payment_date, dateFilter, filterDate);
      return matchesSearch && matchesMethod && matchesStatus && matchesDate;
    });
  }, [payments, searchQuery, filterMethod, filterStatus, dateFilter, filterDate]);

  const openRecord = () => {
    if (!canOperate) {
      toast.error('You do not have permission to record payments.');
      return;
    }
    navigate('/gh/payments/new');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Void this payment? The stay balance will be updated and a reversing journal will be posted.')) return;
    try {
      await deleteGhPayment(id);
      toast.success('Payment voided');
      if (selectedPayment?.id === id) setSelectedPayment(null);
      load();
    } catch {
      toast.error('Failed to delete payment');
    }
  };

  const stayForPayment = (p) => stays.find((s) => String(s.id) === String(p.stay));

  useEscapeClose(Boolean(selectedPayment), () => setSelectedPayment(null));

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
            Record guest deposits, track collections, and monitor outstanding balances.
          </p>
        </div>
        {canOperate && (
          <button
            type="button"
            className="btn-primary"
            onClick={openRecord}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px', fontWeight: '600' }}
          >
            <Plus size={18} /> Record Payment
          </button>
        )}
      </div>

      <section className="dash-kpi-grid" style={{ marginBottom: '32px' }}>
        <StatCard label="Collected" value={metrics.totalCollected} icon={Wallet} variant="success" isCurrency />
        <StatCard label="Pending payments" value={metrics.pendingAmount} icon={Wallet} variant="warning" isCurrency />
        <StatCard label="Total billed (stays)" value={metrics.totalBilled} icon={BedDouble} variant="primary" isCurrency />
        <StatCard
          label="Outstanding (due)"
          value={metrics.totalDue}
          icon={FileText}
          variant={metrics.totalDue > 0 ? 'danger' : 'info'}
          isCurrency
        />
      </section>

      <div className="search-filter-bar">
        <div className="search-filter-bar__search">
          <SearchInput
            variant="inset"
            placeholder="Search ref, guest, room, notes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>Date</span>
          <GhFilterSelect
            value={dateFilter}
            onChange={setDateFilter}
            options={GH_DATE_FILTER_OPTIONS}
            aria-label="Payment date filter"
          />
          {dateFilter === 'date' && (
            <input
              type="date"
              className="search-filter-bar__select"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>Method</span>
          <GhFilterSelect
            value={filterMethod}
            onChange={setFilterMethod}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'CASH', label: 'Cash' },
              { value: 'ONLINE', label: 'Online' },
            ]}
            aria-label="Payment method filter"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>Status</span>
          <GhFilterSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'VOIDED', label: 'Voided' },
            ]}
            aria-label="Payment status filter"
          />
        </div>
        {(searchQuery || filterMethod !== 'ALL' || filterStatus !== 'ALL' || dateFilter !== 'today') && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSearchQuery('');
              setFilterMethod('ALL');
              setFilterStatus('ALL');
              setDateFilter('today');
              setFilterDate(todayISO());
            }}
            style={{ padding: '10px 18px', fontSize: '12px', fontWeight: '700' }}
          >
            Reset
          </button>
        )}
      </div>

      <div className={`split-layout ${selectedPayment ? 'split-layout--payments' : ''}`}>
        <div className="card table-scroll" style={{ padding: 0, borderRadius: '16px', overflow: 'hidden' }}>
          <p style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', margin: 0 }}>
            Click a row to view payment and stay details
          </p>
          {loading ? (
            <AppLoader inline message="Loading payments…" />
          ) : (
            <DataTable
              variant="erp"
              sortable
              showColumnChooser
              pageSize={25}
              selectedId={selectedPayment?.id}
              emptyTitle="No payments match your filters"
              emptyDescription="Try another date, method, or search."
              columns={[
                { key: 'id', label: 'Payment' },
                { key: 'customer_name', label: 'Guest' },
                { key: 'stay_ref', label: 'Stay / Room' },
                { key: 'due', label: 'Due', width: '110px' },
                { key: 'amount', label: 'Amount', width: '120px' },
              ]}
              data={filtered}
              onRowClick={setSelectedPayment}
              getSortValue={(row, key) => {
                if (key === 'amount') return Number(row.amount || 0);
                if (key === 'due') {
                  const stay = stayForPayment(row);
                  return stay ? Math.max(0, Number(stay.total_amount) - Number(stay.advance_paid)) : 0;
                }
                return row[key];
              }}
              rowActions={(p) => [
                { label: 'Print', icon: <Printer size={14} />, onClick: () => navigate(`/gh/print/payment/${p.id}`) },
              ]}
              renderCell={(p, key) => {
                const stay = stayForPayment(p);
                const due = stay ? Math.max(0, Number(stay.total_amount) - Number(stay.advance_paid)) : null;
                if (key === 'id') {
                  return (
                    <div>
                      <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 12 }}>PAY-{String(p.id).padStart(5, '0')}</span>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        {p.payment_date ? new Date(p.payment_date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                      </p>
                      <StatusBadge status={p.status} />
                    </div>
                  );
                }
                if (key === 'stay_ref') {
                  return (
                    <div>
                      <span style={{ fontWeight: 600 }}>{p.stay_ref}</span>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Room {p.room_number} · {METHOD_LABELS[p.payment_method] || p.payment_method}
                      </p>
                    </div>
                  );
                }
                if (key === 'due') {
                  return (
                    <span style={{ fontWeight: 800, color: due != null && hasCollectDue(due) ? 'var(--error)' : 'var(--text-muted)' }}>
                      {due != null ? formatCollectDue(due) : '-'}
                    </span>
                  );
                }
                if (key === 'amount') return <span style={{ fontWeight: 800, color: '#166534' }}>{formatRs(p.amount)}</span>;
                return p[key] || '-';
              }}
            />
          )}
        </div>

        {selectedPayment && (
          <div className="card" style={{ padding: '24px', position: 'sticky', top: '24px', alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>
                  PAY-{String(selectedPayment.id).padStart(5, '0')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Payment details</p>
              </div>
              <button type="button" onClick={() => setSelectedPayment(null)} aria-label="Close payment" style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '16px', padding: '16px', borderRadius: '12px', background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '8px' }}>Guest</p>
              <p style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <User size={16} /> {selectedPayment.customer_name || '-'}
              </p>
            </div>

            <div style={{ marginBottom: '16px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Stay</p>
              <p style={{ fontWeight: '700', margin: 0 }}>{selectedPayment.stay_ref}</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Room {selectedPayment.room_number}
              </p>
              {stayForPayment(selectedPayment) && (
                <dl style={{ margin: '12px 0 0', fontSize: '13px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
                  <dt style={{ color: 'var(--text-muted)' }}>Stay total</dt>
                  <dd style={{ fontWeight: '700' }}>{formatRs(stayForPayment(selectedPayment).total_amount)}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>Paid total</dt>
                  <dd style={{ color: '#166534', fontWeight: '700' }}>{formatRs(stayForPayment(selectedPayment).advance_paid)}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>Balance due</dt>
                  <dd style={{ fontWeight: '700', color: 'var(--error)' }}>
                    {formatCollectDue(
                      Math.max(
                        0,
                        Number(stayForPayment(selectedPayment).total_amount)
                          - Number(stayForPayment(selectedPayment).advance_paid),
                      ),
                    )}
                  </dd>
                </dl>
              )}
            </div>

            <div
              style={{
                marginBottom: '20px',
                padding: '16px',
                borderRadius: '12px',
                background: 'rgba(91, 213, 30, 0.06)',
                border: '1px solid rgba(91, 213, 30, 0.2)',
              }}
            >
              <p style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', marginBottom: '8px' }}>This payment</p>
              <p style={{ fontSize: '26px', fontWeight: '900', color: '#166534', margin: 0 }}>{formatRs(selectedPayment.amount)}</p>
              <p style={{ fontSize: '13px', marginTop: '8px' }}>
                {METHOD_LABELS[selectedPayment.payment_method] || selectedPayment.payment_method}
                {' · '}
                <StatusBadge status={selectedPayment.status} />
              </p>
              {selectedPayment.notes && (
                <p style={{ fontSize: '12px', marginTop: '8px', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                  {selectedPayment.notes}
                </p>
              )}
              <AuditMeta
                status={selectedPayment.status}
                createdBy={selectedPayment.recorded_by_name}
                createdAt={selectedPayment.created_at || selectedPayment.payment_date}
                updatedAt={selectedPayment.updated_at}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {canManage && !isLockedPayment(selectedPayment.status) && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigate(`/gh/payments/${selectedPayment.id}/edit`)}
                  style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Edit2 size={16} /> Edit payment
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate(`/gh/print/payment/${selectedPayment.id}`)}
                style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Printer size={16} /> Print receipt
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(`/gh/print/stay/${selectedPayment.stay}`)}
                style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Printer size={16} /> Print stay invoice
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(`/gh/stays/${selectedPayment.stay}`)}
                style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <FileText size={16} /> View stay
              </button>
              {canManage && selectedPayment.status !== 'VOIDED' && (
                <button
                  type="button"
                  onClick={() => handleDelete(selectedPayment.id)}
                  style={{
                    padding: '10px',
                    color: '#ef4444',
                    background: 'transparent',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Trash2 size={16} /> Void payment
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
