import { useEffect, useState } from 'react';
import { getTrialBalance, listAccounts } from '../api/accounting';
import DataTable from '../components/ui/DataTable';
import AppLoader from '../components/AppLoader';
import { usePageTitle } from '../context/PageTitleContext';
import { formatRs } from '../utils/currency';

const TrialBalance = () => {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [tab, setTab] = useState('balance');
  const [loading, setLoading] = useState(true);
  usePageTitle('General Ledger');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrialBalance(), listAccounts()])
      .then(([balance, chart]) => {
        if (cancelled) return;
        setRows(balance.rows || []);
        setTotals({ debit: balance.total_debit || 0, credit: balance.total_credit || 0 });
        setAccounts(chart.results || chart || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <AppLoader inline message="Loading ledger…" />;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Trial balance and chart of accounts. Posted journals stay immutable.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={tab === 'balance' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('balance')}>
            Trial balance
          </button>
          <button type="button" className={tab === 'chart' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('chart')}>
            Chart of accounts
          </button>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {tab === 'balance' ? (
          <>
            <p style={{ padding: '10px 14px', margin: 0, fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
              Totals {formatRs(totals.debit)} debit · {formatRs(totals.credit)} credit
            </p>
            <DataTable
              variant="erp"
              sortable
              showColumnChooser
              pageSize={25}
              emptyTitle="No posted balances"
              emptyDescription="Post a booking, payment, or expense to populate the ledger."
              columns={[
                { key: 'code', label: 'Code', width: '90px' },
                { key: 'name', label: 'Account' },
                { key: 'account_type', label: 'Type', width: '110px' },
                { key: 'debit', label: 'Debit', width: '120px' },
                { key: 'credit', label: 'Credit', width: '120px' },
                { key: 'balance', label: 'Balance', width: '120px' },
              ]}
              data={rows}
              renderCell={(row, key) => {
                if (['debit', 'credit', 'balance'].includes(key)) return formatRs(row[key]);
                return row[key] || '—';
              }}
            />
          </>
        ) : (
          <DataTable
            variant="erp"
            sortable
            showColumnChooser
            pageSize={25}
            emptyTitle="No accounts"
            emptyDescription="A default chart is created for each tenant."
            columns={[
              { key: 'code', label: 'Code', width: '90px' },
              { key: 'name', label: 'Name' },
              { key: 'account_type', label: 'Type', width: '120px' },
              { key: 'is_active', label: 'Active', width: '90px' },
            ]}
            data={accounts}
            renderCell={(row, key) => {
              if (key === 'is_active') return row.is_active ? 'Yes' : 'No';
              return row[key] || '—';
            }}
          />
        )}
      </div>
    </div>
  );
};

export default TrialBalance;
