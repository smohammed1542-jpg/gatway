import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Edit2, FileText, Printer, ChevronRight, X, Calendar,
  Briefcase, Zap, Wallet, Wrench, Copy, ExternalLink,
} from 'lucide-react';
import { listGhExpenses, deleteGhExpense } from '../../api/guesthouse';
import toast from 'react-hot-toast';
import AppLoader from '../../components/AppLoader';
import { usePermissions } from '../../hooks/usePermissions';
import { formatRs } from '../../utils/currency';
import { voucherDisplayId } from '../../utils/ghExpenseHelpers';
import SearchInput from '../../components/SearchInput';
import StatCard from '../../components/ui/StatCard';
import DataTable from '../../components/ui/DataTable';
import AuditMeta from '../../components/ui/AuditMeta';
import useEscapeClose from '../../hooks/useEscapeClose';
import { isLockedExpense } from '../../utils/erp';
import GhFilterSelect, { GH_DATE_FILTER_OPTIONS } from '../../components/guesthouse/GhFilterSelect';
import { todayISO, matchesDateFilter } from '../../utils/ghDate';
import '../../styles/dashboard.css';

const CATEGORIES = [
  { value: 'ALL', label: 'All categories' },
  { value: 'SALARY', label: 'Salary' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'SUPPLIES', label: 'Supplies' },
  { value: 'LAUNDRY', label: 'Laundry' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'OTHER', label: 'Other' },
];

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORIES.filter((c) => c.value !== 'ALL').map((c) => [c.value, c.label]),
);

const CATEGORY_STYLE = {
  SALARY: { bg: '#dbeafe', color: '#1e40af' },
  UTILITIES: { bg: '#fef3c7', color: '#92400e' },
  MAINTENANCE: { bg: '#f3e8ff', color: '#6b21a8' },
  SUPPLIES: { bg: '#e0f2fe', color: '#0369a1' },
  LAUNDRY: { bg: '#fce7f3', color: '#9d174d' },
  MARKETING: { bg: '#dcfce7', color: '#166534' },
  OTHER: { bg: '#f1f5f9', color: '#475569' },
};

function sumByCategory(expenses, cat) {
  return expenses
    .filter((e) => e.category === cat)
    .reduce((s, e) => s + Number(e.amount || 0), 0);
}

export default function GuestHouseExpenses() {
  const navigate = useNavigate();
  const { canManage } = usePermissions();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('today');
  const [filterDate, setFilterDate] = useState(todayISO());
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setExpenses(await listGhExpenses());
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return expenses.filter((e) => {
      const matchCat = filterCategory === 'ALL' || e.category === filterCategory;
      const matchSearch = !q
        || (e.title || '').toLowerCase().includes(q)
        || (e.category || '').toLowerCase().includes(q)
        || (e.description || '').toLowerCase().includes(q)
        || (CATEGORY_LABELS[e.category] || '').toLowerCase().includes(q);
      const matchDate = matchesDateFilter(e.expense_date, dateFilter, filterDate);
      return matchCat && matchSearch && matchDate;
    });
  }, [expenses, searchQuery, filterCategory, dateFilter, filterDate]);

  const metrics = useMemo(() => {
    const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const filteredTotal = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthTotal = expenses
      .filter((e) => (e.expense_date || '').startsWith(thisMonth))
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return {
      total,
      filteredTotal,
      monthTotal,
      salary: sumByCategory(expenses, 'SALARY'),
      utilities: sumByCategory(expenses, 'UTILITIES'),
      maintenance: sumByCategory(expenses, 'MAINTENANCE'),
    };
  }, [expenses, filtered]);

  const handleDelete = async (id) => {
    if (!window.confirm('Cancel this posted expense? The journal will be reversed; the voucher is kept for audit.')) return;
    try {
      await deleteGhExpense(id);
      toast.success('Expense cancelled');
      if (selected?.id === id) setSelected(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel voucher');
    }
  };

  const openCreate = () => {
    if (!canManage) {
      toast.error('You do not have permission to add expenses.');
      return;
    }
    navigate('/gh/expenses/new');
  };

  useEscapeClose(Boolean(selected), () => setSelected(null));

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
            Track guest house operating costs - salary, utilities, maintenance, and more.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="btn-primary"
            onClick={openCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px', fontWeight: '600' }}
          >
            <Plus size={18} /> Add voucher
          </button>
        )}
      </div>

      <section className="dash-kpi-grid" style={{ marginBottom: '32px' }}>
        <StatCard label="Total expenses" value={metrics.total} icon={Wallet} variant="warning" isCurrency />
        <StatCard label="This month" value={metrics.monthTotal} icon={Calendar} variant="primary" isCurrency />
        <StatCard label="Salary" value={metrics.salary} icon={Briefcase} variant="info" isCurrency />
        <StatCard label="Utilities" value={metrics.utilities} icon={Zap} variant="warning" isCurrency />
      </section>

      <div className="grid-3 grid-3--mb" style={{ marginBottom: '32px' }}>
        <div className="premium-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Wrench size={28} color="var(--primary)" />
          <div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Maintenance</p>
            <p style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0 0' }}>{formatRs(metrics.maintenance)}</p>
          </div>
        </div>
        <div className="premium-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Filtered total</p>
          <p style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0 0', color: '#ef4444' }}>{formatRs(metrics.filteredTotal)}</p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{filtered.length} voucher{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="premium-card" style={{ padding: '20px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>All vouchers</p>
          <p style={{ fontSize: '22px', fontWeight: '800', margin: '4px 0 0 0' }}>{expenses.length}</p>
        </div>
      </div>

      <div className="search-filter-bar">
        <div className="search-filter-bar__search">
          <SearchInput
            variant="inset"
            placeholder="Search title, category, description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <GhFilterSelect
          value={filterCategory}
          onChange={setFilterCategory}
          options={CATEGORIES}
          aria-label="Expense category filter"
        />
        <GhFilterSelect
          value={dateFilter}
          onChange={setDateFilter}
          options={GH_DATE_FILTER_OPTIONS}
          aria-label="Expense date filter"
        />
        {dateFilter === 'date' && (
          <input
            type="date"
            className="search-filter-bar__select"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        )}
        {(searchQuery || filterCategory !== 'ALL' || dateFilter !== 'today') && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setSearchQuery(''); setFilterCategory('ALL'); setDateFilter('today'); setFilterDate(todayISO()); }}
            style={{ padding: '10px 18px', fontSize: '12px', fontWeight: '700' }}
          >
            Reset
          </button>
        )}
      </div>

      <div className={`split-layout ${selected ? 'split-layout--payments' : ''}`}>
        <div className="card table-scroll" style={{ padding: 0, borderRadius: '16px', overflow: 'hidden' }}>
          <p style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', margin: 0 }}>
            Click a row to open voucher - print or use again
          </p>
          {loading ? (
            <AppLoader inline message="Loading expenses…" />
          ) : (
            <DataTable
              variant="erp"
              sortable
              showColumnChooser
              pageSize={25}
              selectedId={selected?.id}
              emptyTitle="No expenses match your filters"
              emptyDescription="Try another category, date, or search."
              columns={[
                { key: 'title', label: 'Voucher' },
                { key: 'category', label: 'Category', width: '130px' },
                { key: 'expense_date', label: 'Date', width: '120px' },
                { key: 'amount', label: 'Amount', width: '120px' },
                { key: 'status', label: 'Status', width: '110px' },
              ]}
              data={filtered}
              onRowClick={setSelected}
              getSortValue={(row, key) => (key === 'amount' ? Number(row.amount || 0) : row[key])}
              rowActions={(exp) => [
                { label: 'Print', icon: <Printer size={14} />, onClick: () => navigate(`/gh/print/expense/${exp.id}`) },
              ]}
              renderCell={(exp, key) => {
                if (key === 'title') {
                  return (
                    <div>
                      <p style={{ fontWeight: 700, margin: 0 }}>{exp.title}</p>
                      {exp.description && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {exp.description}
                        </p>
                      )}
                    </div>
                  );
                }
                if (key === 'category') {
                  const st = CATEGORY_STYLE[exp.category] || CATEGORY_STYLE.OTHER;
                  return (
                    <span style={{ fontSize: 11, padding: '6px 12px', borderRadius: 20, fontWeight: 700, background: st.bg, color: st.color }}>
                      {CATEGORY_LABELS[exp.category] || exp.category}
                    </span>
                  );
                }
                if (key === 'amount') return <span style={{ fontWeight: 800, color: '#ef4444' }}>−{formatRs(exp.amount)}</span>;
                if (key === 'status') return exp.status || 'POSTED';
                return exp[key] || '—';
              }}
            />
          )}
        </div>

        {selected && (
          <div className="card" style={{ padding: '24px', position: 'sticky', top: '24px', alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <p style={{ fontSize: '11px', fontWeight: '800', fontFamily: 'monospace', color: 'var(--primary)', margin: '0 0 4px 0' }}>
                  {voucherDisplayId(selected.id)}
                </p>
                <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>{selected.title}</h3>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close voucher" style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <span style={{ fontSize: '11px', padding: '6px 12px', borderRadius: '20px', fontWeight: '700', background: (CATEGORY_STYLE[selected.category] || CATEGORY_STYLE.OTHER).bg, color: (CATEGORY_STYLE[selected.category] || CATEGORY_STYLE.OTHER).color }}>
              {CATEGORY_LABELS[selected.category]}
            </span>

            <div style={{ margin: '20px 0', padding: '16px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca' }}>
              <p style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-dim)', margin: '0 0 6px 0' }}>Amount</p>
              <p style={{ fontSize: '28px', fontWeight: '900', color: '#ef4444', margin: 0 }}>{formatRs(selected.amount)}</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>Date: {selected.expense_date}</p>
            </div>

            {selected.description && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                <strong>Notes:</strong> {selected.description}
              </p>
            )}
            {selected.created_by_name && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Recorded by: <strong>{selected.created_by_name}</strong>
              </p>
            )}
            <AuditMeta
              status={selected.status}
              createdBy={selected.created_by_name}
              createdAt={selected.created_at}
              updatedAt={selected.updated_at}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button type="button" className="btn-primary" onClick={() => navigate(`/gh/expenses/${selected.id}`)} style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <ExternalLink size={16} /> Open voucher
              </button>
              <button type="button" className="btn-secondary" onClick={() => navigate(`/gh/print/expense/${selected.id}`)} style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Printer size={16} /> Print voucher
              </button>
              {canManage && (
                <button type="button" className="btn-secondary" onClick={() => navigate(`/gh/expenses/new?from=${selected.id}`)} style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Copy size={16} /> Use again
                </button>
              )}
              {canManage && !isLockedExpense(selected.status) && (
                <button type="button" className="btn-secondary" onClick={() => navigate(`/gh/expenses/${selected.id}/edit`)} style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Edit2 size={16} /> Edit voucher
                </button>
              )}
              {canManage && !isLockedExpense(selected.status) && (
                <button
                  type="button"
                  onClick={() => handleDelete(selected.id)}
                  style={{ padding: '10px', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'transparent' }}
                >
                  <Trash2 size={16} /> Cancel voucher
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
