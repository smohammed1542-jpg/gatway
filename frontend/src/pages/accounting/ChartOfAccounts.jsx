import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { listAccounts, deactivateAccount } from '../../api/accounting';
import DataTable from '../../components/ui/DataTable';
import AppLoader from '../../components/AppLoader';
import { usePageTitle } from '../../context/PageTitleContext';
import { rowsOf } from '../../utils/accountingUi';
import { usePermissions } from '../../hooks/usePermissions';

const ChartOfAccounts = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { canManage } = usePermissions();
  usePageTitle('Chart of Accounts');

  const load = () => {
    setLoading(true);
    listAccounts()
      .then((d) => setRows(rowsOf(d)))
      .catch(() => toast.error('Failed to load accounts'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
