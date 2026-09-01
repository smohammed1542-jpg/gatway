import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  listAccounts, createAccount, updateAccount, deactivateAccount,
} from '../../api/accounting';
import DataTable from '../../components/ui/DataTable';
import AppLoader from '../../components/AppLoader';
import { usePageTitle } from '../../context/PageTitleContext';
import { rowsOf } from '../../utils/accountingUi';
import { usePermissions } from '../../hooks/usePermissions';

const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

const ChartOfAccounts = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: '', name: '', account_type: 'EXPENSE', description: '' });
  const [showForm, setShowForm] = useState(false);
  const { isAdmin, canManage } = usePermissions();
  usePageTitle('Chart of Accounts');

  const load = () => {
    setLoading(true);
    listAccounts()
      .then((d) => setRows(rowsOf(d)))
      .catch(() => toast.error('Failed to load accounts'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    try {
      await createAccount(form);
      toast.success('Account created');
      setShowForm(false);
      setForm({ code: '', name: '', account_type: 'EXPENSE', description: '' });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Create failed');
    }
  };

  const onDeactivate = async (row) => {
    if (!window.confirm(`Deactivate ${row.code} ${row.name}?`)) return;
    try {
      await deactivateAccount(row.id);
      toast.success('Account deactivated');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  if (loading) return <AppLoader inline message="Loading chart of accounts…" />;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          System accounts cannot be deleted. Deactivate unused accounts.
        </p>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'New Account'}
          </button>
        )}
      </div>
      {showForm && (
        <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={onCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12 }}>
            <input required placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <textarea
            placeholder="Description"
            style={{ width: '100%', marginTop: 8 }}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>Save</button>
        </form>
      )}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          variant="erp"
          sortable
          pageSize={25}
          emptyTitle="No accounts"
          columns={[
            { key: 'code', label: 'Code', width: '90px' },
            { key: 'name', label: 'Name' },
            { key: 'account_type', label: 'Type', width: '110px' },
            { key: 'is_system', label: 'System', width: '80px' },
            { key: 'is_active', label: 'Active', width: '80px' },
            { key: 'actions', label: '', width: '120px' },
          ]}
          data={rows}
          renderCell={(row, key) => {
            if (key === 'is_system') return row.is_system ? 'Yes' : 'No';
            if (key === 'is_active') return row.is_active ? 'Yes' : 'No';
            if (key === 'actions' && canManage && row.is_active) {
              return (
                <button type="button" className="btn-secondary" style={{ fontSize: 11 }} onClick={() => onDeactivate(row)}>
                  Deactivate
                </button>
              );
            }
            return row[key] ?? '—';
          }}
        />
      </div>
    </div>
  );
};

export default ChartOfAccounts;
