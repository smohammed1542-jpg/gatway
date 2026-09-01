import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getTrialBalance, getProfitAndLoss, getBalanceSheet, getCashFlow,
  getGeneralLedger, getCashBook, getBankBook, getIntegrityCheck,
  listAccounts,
} from '../../api/accounting';
import DataTable from '../../components/ui/DataTable';
import AppLoader from '../../components/AppLoader';
import { usePageTitle } from '../../context/PageTitleContext';
import { formatRs } from '../../utils/currency';
import { downloadCsv, printPage, todayISO, monthStartISO, rowsOf } from '../../utils/accountingUi';

const ReportShell = ({ title, children, onExport, onPrint }) => (
  <div className="animate-fade-in">
    <div className="page-header">
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>{title}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {onExport && <button type="button" className="btn-secondary" onClick={onExport}>CSV</button>}
        {onPrint && <button type="button" className="btn-secondary" onClick={onPrint || printPage}>Print</button>}
      </div>
    </div>
    {children}
  </div>
);

const DateFilters = ({ start, end, asOf, setStart, setEnd, setAsOf, onApply, showAsOf }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'end' }}>
    {showAsOf ? (
      <label>As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
    ) : (
      <>
        <label>From <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>To <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </>
    )}
    <button type="button" className="btn-primary" onClick={onApply}>Apply</button>
  </div>
);

export const TrialBalancePage = () => {
  usePageTitle('Trial Balance');
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ debit: 0, credit: 0, balanced: true });
  const [asOf, setAsOf] = useState(todayISO());
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getTrialBalance({ as_of: asOf })
      .then((d) => {
        setRows(d.rows || []);
        setTotals({ debit: d.total_debit, credit: d.total_credit, balanced: d.balanced });
      })
      .catch(() => toast.error('Failed to load trial balance'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return <AppLoader inline message="Loading trial balance…" />;
  return (
    <ReportShell
      title={`Totals ${formatRs(totals.debit)} debit · ${formatRs(totals.credit)} credit · ${totals.balanced ? 'Balanced' : 'OUT OF BALANCE'}`}
      onExport={() => downloadCsv('trial-balance.csv', ['Code', 'Name', 'Type', 'Debit', 'Credit'], rows.map((r) => [r.code, r.name, r.account_type, r.debit, r.credit]))}
      onPrint={printPage}
    >
      <DateFilters asOf={asOf} setAsOf={setAsOf} showAsOf onApply={load} />
      <div className="card" style={{ padding: 0 }}>
        <DataTable
          variant="erp" sortable pageSize={50}
          emptyTitle="No balances"
          columns={[
            { key: 'code', label: 'Code', width: '90px' },
            { key: 'name', label: 'Account' },
            { key: 'account_type', label: 'Type', width: '110px' },
            { key: 'debit', label: 'Debit', width: '120px' },
            { key: 'credit', label: 'Credit', width: '120px' },
          ]}
          data={rows}
          renderCell={(row, key) => (['debit', 'credit'].includes(key) ? formatRs(row[key]) : (row[key] || '—'))}
        />
      </div>
    </ReportShell>
  );
};

export const ProfitLossPage = () => {
  usePageTitle('Profit & Loss');
  const [data, setData] = useState(null);
  const [start, setStart] = useState(monthStartISO());
  const [end, setEnd] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    getProfitAndLoss({ start, end })
      .then(setData)
      .catch(() => toast.error('Failed to load P&L'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  if (loading) return <AppLoader inline message="Loading P&L…" />;
  const rev = data?.revenue || [];
  const exp = data?.expenses || [];
  return (
    <ReportShell
      title={`Net ${formatRs(data?.net_profit)} · Revenue ${formatRs(data?.total_revenue)} · Expenses ${formatRs(data?.total_expenses)}`}
      onExport={() => downloadCsv('profit-loss.csv', ['Section', 'Code', 'Name', 'Amount'], [
        ...rev.map((r) => ['Revenue', r.code, r.name, r.amount]),
        ...exp.map((r) => ['Expense', r.code, r.name, r.amount]),
      ])}
      onPrint={printPage}
    >
      <DateFilters start={start} end={end} setStart={setStart} setEnd={setEnd} onApply={load} />
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Revenue</h3>
        {rev.map((r) => <div key={r.code} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{r.code} {r.name}</span><strong>{formatRs(r.amount)}</strong></div>)}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}><strong>Total Revenue</strong><strong>{formatRs(data?.total_revenue)}</strong></div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Expenses</h3>
        {exp.map((r) => <div key={r.code} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{r.code} {r.name}</span><strong>{formatRs(r.amount)}</strong></div>)}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}><strong>Total Expenses</strong><strong>{formatRs(data?.total_expenses)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 18 }}><strong>Net Profit / Loss</strong><strong>{formatRs(data?.net_profit)}</strong></div>
      </div>
    </ReportShell>
  );
};

export const BalanceSheetPage = () => {
  usePageTitle('Balance Sheet');
  const [data, setData] = useState(null);
  const [asOf, setAsOf] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    getBalanceSheet({ as_of: asOf }).then(setData).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  if (loading) return <AppLoader inline message="Loading balance sheet…" />;
  const section = (title, rows, total) => (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {(rows || []).map((r) => (
        <div key={r.code} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{r.code} {r.name}</span><strong>{formatRs(r.amount)}</strong>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <strong>Total {title}</strong><strong>{formatRs(total)}</strong>
      </div>
    </div>
  );
  return (
    <ReportShell
      title={data?.balanced ? 'Assets = Liabilities + Equity' : `Out of balance by ${formatRs(data?.difference)}`}
      onPrint={printPage}
    >
      <DateFilters asOf={asOf} setAsOf={setAsOf} showAsOf onApply={load} />
      {section('Assets', data?.assets, data?.total_assets)}
      {section('Liabilities', data?.liabilities, data?.total_liabilities)}
      {section('Equity', data?.equity, data?.total_equity)}
    </ReportShell>
  );
};

export const CashFlowPage = () => {
  usePageTitle('Cash Flow');
  const [data, setData] = useState(null);
  const [start, setStart] = useState(monthStartISO());
  const [end, setEnd] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    getCashFlow({ start, end }).then(setData).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  if (loading) return <AppLoader inline message="Loading cash flow…" />;
  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
      <span>{label}</span><strong>{formatRs(value)}</strong>
    </div>
  );
  return (
    <ReportShell title="Cash & bank movements" onPrint={printPage}>
      <DateFilters start={start} end={end} setStart={setStart} setEnd={setEnd} onApply={load} />
      <div className="card" style={{ padding: 16 }}>
        {row('Opening Cash', data?.opening_cash)}
        {row('Cash Inflows', data?.cash_inflows)}
        {row('Cash Outflows', data?.cash_outflows)}
        {row('Net Movement', data?.net_cash_movement)}
        {row('Closing Cash', data?.closing_cash)}
        <h4>Operating</h4>
        {row('Inflows', data?.operating?.inflows)}
        {row('Outflows', data?.operating?.outflows)}
        {row('Net', data?.operating?.net)}
      </div>
    </ReportShell>
  );
};

export const GeneralLedgerPage = () => {
  usePageTitle('General Ledger');
  const [accounts, setAccounts] = useState([]);
  const [account, setAccount] = useState('');
  const [data, setData] = useState(null);
  const [start, setStart] = useState(monthStartISO());
  const [end, setEnd] = useState(todayISO());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listAccounts().then((d) => setAccounts(rowsOf(d)));
  }, []);

  const load = () => {
    setLoading(true);
    getGeneralLedger({ account: account || undefined, start, end })
      .then(setData)
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  };

  return (
    <ReportShell title={`Opening ${formatRs(data?.opening_balance)} · Closing ${formatRs(data?.closing_balance)}`} onPrint={printPage}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} {a.name}</option>)}
        </select>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button type="button" className="btn-primary" onClick={load}>Load</button>
      </div>
      {loading ? <AppLoader inline message="Loading GL…" /> : (
        <div className="card" style={{ padding: 0 }}>
          <DataTable
            variant="erp" sortable pageSize={50}
            emptyTitle="Select filters and load"
            columns={[
              { key: 'entry_date', label: 'Date', width: '110px' },
              { key: 'entry_no', label: 'Entry' },
              { key: 'account_code', label: 'Acct', width: '80px' },
              { key: 'description', label: 'Description' },
              { key: 'debit', label: 'Debit', width: '110px' },
              { key: 'credit', label: 'Credit', width: '110px' },
              { key: 'balance', label: 'Balance', width: '110px' },
            ]}
            data={data?.rows || []}
            renderCell={(row, key) => (['debit', 'credit', 'balance'].includes(key) ? formatRs(row[key]) : (row[key] || row.description || row.memo || '—'))}
          />
        </div>
      )}
    </ReportShell>
  );
};

export const CashBookPage = () => {
  usePageTitle('Cash Book');
  const [data, setData] = useState(null);
  const [start, setStart] = useState(monthStartISO());
  const [end, setEnd] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    getCashBook({ start, end }).then(setData).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  if (loading) return <AppLoader inline message="Loading cash book…" />;
  return (
    <ReportShell title={`Opening ${formatRs(data?.opening_balance)} · Closing ${formatRs(data?.closing_balance)}`} onPrint={printPage}
      onExport={() => downloadCsv('cash-book.csv', ['Date', 'Ref', 'Desc', 'In', 'Out', 'Bal'], (data?.rows || []).map((r) => [r.date, r.reference, r.description, r.received, r.paid, r.balance]))}
    >
      <DateFilters start={start} end={end} setStart={setStart} setEnd={setEnd} onApply={load} />
      <div className="card" style={{ padding: 0 }}>
        <DataTable
          variant="erp" pageSize={50}
          emptyTitle="No cash movements"
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'reference', label: 'Reference' },
            { key: 'description', label: 'Description' },
            { key: 'received', label: 'Received' },
            { key: 'paid', label: 'Paid' },
            { key: 'balance', label: 'Balance' },
          ]}
          data={data?.rows || []}
          renderCell={(row, key) => (['received', 'paid', 'balance'].includes(key) ? formatRs(row[key]) : (row[key] || '—'))}
        />
      </div>
    </ReportShell>
  );
};

export const BankBookPage = () => {
  usePageTitle('Bank Book');
  const [data, setData] = useState(null);
  const [start, setStart] = useState(monthStartISO());
  const [end, setEnd] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    getBankBook({ start, end }).then(setData).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  if (loading) return <AppLoader inline message="Loading bank book…" />;
  return (
    <ReportShell title={`Opening ${formatRs(data?.opening_balance)} · Closing ${formatRs(data?.closing_balance)}`} onPrint={printPage}>
      <DateFilters start={start} end={end} setStart={setStart} setEnd={setEnd} onApply={load} />
      <div className="card" style={{ padding: 0 }}>
        <DataTable
          variant="erp" pageSize={50}
          emptyTitle="No bank movements"
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'entry_no', label: 'Entry' },
            { key: 'description', label: 'Description' },
            { key: 'deposit', label: 'Deposit' },
            { key: 'withdrawal', label: 'Withdrawal' },
            { key: 'balance', label: 'Balance' },
          ]}
          data={data?.rows || []}
          renderCell={(row, key) => (['deposit', 'withdrawal', 'balance'].includes(key) ? formatRs(row[key]) : (row[key] || '—'))}
        />
      </div>
    </ReportShell>
  );
};

export const HealthCheckPage = () => {
  usePageTitle('Accounting Health Check');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getIntegrityCheck().then(setData).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  }, []);
  if (loading) return <AppLoader inline message="Running integrity check…" />;
  return (
    <div className="animate-fade-in">
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{data?.ok ? 'All checks passed' : `${data?.issue_count} issue(s) found`}</h3>
        {(data?.issues || []).length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No unbalanced journals, duplicates, or sheet mismatches.</p>
        ) : (
          <ul>
            {(data?.issues || []).map((iss, i) => (
              <li key={i}><code>{JSON.stringify(iss)}</code></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
