import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getReceivables, getPayables, getCustomerLedger, listVendors, createVendor,
  listVendorBills, createVendorBill, createVendorPayment, listAccounts,
  listBankAccounts, createBankAccount, createBankTransfer, listBankTransfers,
  createReconciliation, getUnreconciled, matchReconciliation, completeReconciliation,
  listInvoices, listFiscalPeriods, closeFiscalPeriod, reopenFiscalPeriod,
  getOpeningBalances, postOpeningBalances, createJournalEntry, listJournalEntries,
  postJournalDraft, reverseJournalEntry,
} from '../../api/accounting';
import { getCustomers } from '../../api/customers';
import DataTable from '../../components/ui/DataTable';
import AppLoader from '../../components/AppLoader';
import { usePageTitle } from '../../context/PageTitleContext';
import { formatRs } from '../../utils/currency';
import { rowsOf, todayISO, monthStartISO, printPage, downloadCsv } from '../../utils/accountingUi';
import { usePermissions } from '../../hooks/usePermissions';

export const ReceivablesPage = () => {
  usePageTitle('Accounts Receivable');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getReceivables().then(setData).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  }, []);
  if (loading) return <AppLoader inline message="Loading AR…" />;
  const b = data?.buckets || {};
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Total receivable {formatRs(data?.total)}</p>
        <button type="button" className="btn-secondary" onClick={printPage}>Print</button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['Current', b.current], ['1–30', b['1_30']], ['31–60', b['31_60']], ['61–90', b['61_90']], ['90+', b['90_plus']]].map(([l, v]) => (
          <div key={l} className="card" style={{ padding: 12, minWidth: 120 }}><div style={{ fontSize: 12 }}>{l}</div><strong>{formatRs(v)}</strong></div>
        ))}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <DataTable
          variant="erp" pageSize={25} emptyTitle="No receivables"
          columns={[
            { key: 'customer_name', label: 'Customer' },
            { key: 'booking_ref', label: 'Booking' },
            { key: 'due_date', label: 'Due' },
            { key: 'days_overdue', label: 'Days' },
            { key: 'bucket', label: 'Bucket' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
          ]}
          data={data?.rows || []}
          renderCell={(row, key) => (key === 'amount' ? formatRs(row.amount) : (row[key] ?? '—'))}
        />
      </div>
    </div>
  );
};

export const PayablesPage = () => {
  usePageTitle('Accounts Payable');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getPayables().then(setData).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  }, []);
  if (loading) return <AppLoader inline message="Loading AP…" />;
  return (
    <div className="animate-fade-in">
      <div className="page-header"><p style={{ margin: 0 }}>Total payable {formatRs(data?.total)}</p></div>
      <div className="card" style={{ padding: 0 }}>
        <DataTable
          variant="erp" pageSize={25} emptyTitle="No payables"
          columns={[
            { key: 'vendor_name', label: 'Vendor' },
            { key: 'bill_no', label: 'Bill' },
            { key: 'due_date', label: 'Due' },
            { key: 'days_overdue', label: 'Days' },
            { key: 'bucket', label: 'Bucket' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
          ]}
          data={data?.rows || []}
          renderCell={(row, key) => (key === 'amount' ? formatRs(row.amount) : (row[key] ?? '—'))}
        />
      </div>
    </div>
  );
};

export const CustomerLedgerPage = () => {
  usePageTitle('Customer Ledger');
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [data, setData] = useState(null);
  const [start, setStart] = useState(monthStartISO());
  const [end, setEnd] = useState(todayISO());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCustomers().then((d) => setCustomers(rowsOf(d))).catch(() => {});
  }, []);

  const load = () => {
    if (!customerId) { toast.error('Select a customer'); return; }
    setLoading(true);
    getCustomerLedger({ customer: customerId, start, end })
      .then(setData)
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.display_name || c.id}</option>)}
        </select>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button type="button" className="btn-primary" onClick={load}>Load</button>
        <button type="button" className="btn-secondary" onClick={printPage}>Print</button>
      </div>
      {loading ? <AppLoader inline message="Loading ledger…" /> : data && (
        <>
          <p>Opening {formatRs(data.opening_balance)} · Closing {formatRs(data.closing_balance)}</p>
          <div className="card" style={{ padding: 0 }}>
            <DataTable
              variant="erp" pageSize={50} emptyTitle="No transactions"
              columns={[
                { key: 'date', label: 'Date' },
                { key: 'reference', label: 'Reference' },
                { key: 'description', label: 'Description' },
                { key: 'debit', label: 'Debit' },
                { key: 'credit', label: 'Credit' },
                { key: 'balance', label: 'Balance' },
              ]}
              data={data.rows || []}
              renderCell={(row, key) => (['debit', 'credit', 'balance'].includes(key) ? formatRs(row[key]) : (row[key] || '—'))}
            />
          </div>
        </>
      )}
    </div>
  );
};

export const VendorsPage = () => {
  usePageTitle('Vendors');
  const [vendors, setVendors] = useState([]);
  const [bills, setBills] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [billForm, setBillForm] = useState({ vendor: '', expense_account: '', amount: '', bill_date: todayISO(), description: '' });
  const { canManage } = usePermissions();

  const load = () => {
    setLoading(true);
    Promise.all([listVendors(), listVendorBills(), listAccounts({ account_type: 'EXPENSE' })])
      .then(([v, b, a]) => {
        setVendors(rowsOf(v));
        setBills(rowsOf(b));
        setAccounts(rowsOf(a));
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const saveVendor = async (e) => {
    e.preventDefault();
    try {
      await createVendor(form);
      toast.success('Vendor saved');
      setForm({ name: '', phone: '', email: '' });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  const saveBill = async (e) => {
    e.preventDefault();
    try {
      await createVendorBill({
        ...billForm,
        vendor: Number(billForm.vendor),
        expense_account: Number(billForm.expense_account),
        amount: billForm.amount,
      });
      toast.success('Bill posted');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || 'Failed');
    }
  };

  const payBill = async (bill) => {
    const amount = window.prompt('Payment amount', String(bill.balance_due || bill.amount));
    if (!amount) return;
    try {
      await createVendorPayment({
        vendor: bill.vendor,
        bill: bill.id,
        payment_date: todayISO(),
        amount,
        payment_method: 'CASH',
      });
      toast.success('Payment recorded');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  if (loading) return <AppLoader inline message="Loading vendors…" />;
  return (
    <div className="animate-fade-in">
      {canManage && (
        <>
          <form className="card" style={{ padding: 12, marginBottom: 12 }} onSubmit={saveVendor}>
            <strong>New vendor</strong>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <button className="btn-primary" type="submit">Add</button>
            </div>
          </form>
          <form className="card" style={{ padding: 12, marginBottom: 12 }} onSubmit={saveBill}>
            <strong>New vendor bill</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, marginTop: 8 }}>
              <select required value={billForm.vendor} onChange={(e) => setBillForm({ ...billForm, vendor: e.target.value })}>
                <option value="">Vendor</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <select required value={billForm.expense_account} onChange={(e) => setBillForm({ ...billForm, expense_account: e.target.value })}>
                <option value="">Expense account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
              <input required type="number" step="0.01" placeholder="Amount" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} />
              <input type="date" value={billForm.bill_date} onChange={(e) => setBillForm({ ...billForm, bill_date: e.target.value })} />
              <button className="btn-primary" type="submit">Post bill</button>
            </div>
          </form>
        </>
      )}
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <DataTable variant="erp" pageSize={10} emptyTitle="No vendors" columns={[
          { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'is_active', label: 'Active' },
        ]} data={vendors} renderCell={(r, k) => (k === 'is_active' ? (r.is_active ? 'Yes' : 'No') : (r[k] || '—'))} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <DataTable variant="erp" pageSize={15} emptyTitle="No bills" columns={[
          { key: 'bill_no', label: 'Bill' }, { key: 'vendor_name', label: 'Vendor' }, { key: 'bill_date', label: 'Date' },
          { key: 'amount', label: 'Amount' }, { key: 'amount_paid', label: 'Paid' }, { key: 'status', label: 'Status' }, { key: 'actions', label: '' },
        ]} data={bills} renderCell={(r, k) => {
          if (['amount', 'amount_paid'].includes(k)) return formatRs(r[k]);
          if (k === 'actions' && canManage && r.status !== 'PAID' && r.status !== 'CANCELLED') {
            return <button type="button" className="btn-secondary" style={{ fontSize: 11 }} onClick={() => payBill(r)}>Pay</button>;
          }
          return r[k] ?? '—';
        }} />
      </div>
    </div>
  );
};

export const BankAccountsPage = () => {
  usePageTitle('Bank Accounts');
  const [banks, setBanks] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [form, setForm] = useState({ bank_name: '', account_name: '', account_number: '', gl_account: '', is_default: false });
  const [xfer, setXfer] = useState({ transfer_date: todayISO(), amount: '', from_account: '', to_account: '', memo: '' });
  const { canManage } = usePermissions();

  const load = () => {
    Promise.all([listBankAccounts(), listAccounts({ account_type: 'ASSET' }), listBankTransfers()])
      .then(([b, a, t]) => {
        setBanks(rowsOf(b));
        setAccounts(rowsOf(a));
        setTransfers(rowsOf(t));
        const cash = rowsOf(a).find((x) => x.code === '1000');
        const bank = rowsOf(a).find((x) => x.code === '1010');
        if (cash && bank) setXfer((p) => ({ ...p, from_account: String(cash.id), to_account: String(bank.id) }));
        const bankGl = rowsOf(a).find((x) => x.code === '1010');
        if (bankGl) setForm((p) => ({ ...p, gl_account: String(bankGl.id) }));
      });
  };
  useEffect(() => { load(); }, []);

  const saveBank = async (e) => {
    e.preventDefault();
    try {
      await createBankAccount({ ...form, gl_account: Number(form.gl_account) });
      toast.success('Bank account created');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  const saveXfer = async (e) => {
    e.preventDefault();
    try {
      await createBankTransfer({
        ...xfer,
        amount: xfer.amount,
        from_account: Number(xfer.from_account),
        to_account: Number(xfer.to_account),
      });
      toast.success('Transfer posted');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  return (
    <div className="animate-fade-in">
      {canManage && (
        <>
          <form className="card" style={{ padding: 12, marginBottom: 12 }} onSubmit={saveBank}>
            <strong>New bank account</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input required placeholder="Bank name" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
              <input required placeholder="Account name" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
              <input placeholder="Account number" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
              <select required value={form.gl_account} onChange={(e) => setForm({ ...form, gl_account: e.target.value })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
              <button className="btn-primary" type="submit">Add</button>
            </div>
          </form>
          <form className="card" style={{ padding: 12, marginBottom: 12 }} onSubmit={saveXfer}>
            <strong>Transfer (Cash ↔ Bank)</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input type="date" value={xfer.transfer_date} onChange={(e) => setXfer({ ...xfer, transfer_date: e.target.value })} />
              <input required type="number" step="0.01" placeholder="Amount" value={xfer.amount} onChange={(e) => setXfer({ ...xfer, amount: e.target.value })} />
              <select value={xfer.from_account} onChange={(e) => setXfer({ ...xfer, from_account: e.target.value })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>From {a.code}</option>)}
              </select>
              <select value={xfer.to_account} onChange={(e) => setXfer({ ...xfer, to_account: e.target.value })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>To {a.code}</option>)}
              </select>
              <button className="btn-primary" type="submit">Transfer</button>
            </div>
          </form>
        </>
      )}
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <DataTable variant="erp" emptyTitle="No bank accounts" pageSize={10} columns={[
          { key: 'bank_name', label: 'Bank' }, { key: 'account_name', label: 'Name' },
          { key: 'masked_account_number', label: 'Number' }, { key: 'gl_account_code', label: 'GL' },
          { key: 'is_default', label: 'Default' },
        ]} data={banks} renderCell={(r, k) => (k === 'is_default' ? (r.is_default ? 'Yes' : 'No') : (r[k] || '—'))} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <DataTable variant="erp" emptyTitle="No transfers" pageSize={10} columns={[
          { key: 'transfer_date', label: 'Date' }, { key: 'from_account_code', label: 'From' },
          { key: 'to_account_code', label: 'To' }, { key: 'amount', label: 'Amount' }, { key: 'memo', label: 'Memo' },
        ]} data={transfers} renderCell={(r, k) => (k === 'amount' ? formatRs(r.amount) : (r[k] || '—'))} />
      </div>
    </div>
  );
};

export const BankReconPage = () => {
  usePageTitle('Bank Reconciliation');
  const [banks, setBanks] = useState([]);
  const [recon, setRecon] = useState(null);
  const [lines, setLines] = useState([]);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ bank_account: '', statement_date: todayISO(), statement_balance: '' });
  const { isAdmin, canManage } = usePermissions();

  useEffect(() => {
    listBankAccounts().then((d) => setBanks(rowsOf(d)));
  }, []);

  const start = async (e) => {
    e.preventDefault();
    try {
      const r = await createReconciliation({
        bank_account: Number(form.bank_account),
        statement_date: form.statement_date,
        statement_balance: form.statement_balance,
      });
      setRecon(r);
      const u = await getUnreconciled(r.id);
      setLines(Array.isArray(u) ? u : []);
      toast.success('Reconciliation started');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const doMatch = async () => {
    await matchReconciliation(recon.id, selected);
    toast.success('Matched');
    const u = await getUnreconciled(recon.id);
    setLines(Array.isArray(u) ? u : []);
    setSelected([]);
  };

  const doComplete = async (allow) => {
    try {
      const r = await completeReconciliation(recon.id, { allow_adjustment: allow });
      setRecon(r);
      toast.success('Completed');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Cannot complete');
    }
  };

  return (
    <div className="animate-fade-in">
      {canManage && !recon && (
        <form className="card" style={{ padding: 12 }} onSubmit={start}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select required value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })}>
              <option value="">Bank account</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.bank_name} — {b.account_name}</option>)}
            </select>
            <input type="date" value={form.statement_date} onChange={(e) => setForm({ ...form, statement_date: e.target.value })} />
            <input required type="number" step="0.01" placeholder="Statement balance" value={form.statement_balance} onChange={(e) => setForm({ ...form, statement_balance: e.target.value })} />
            <button className="btn-primary" type="submit">Start</button>
          </div>
        </form>
      )}
      {recon && (
        <div className="card" style={{ padding: 16 }}>
          <p>Book {formatRs(recon.book_balance)} · Statement {formatRs(recon.statement_balance)} · Diff {formatRs(recon.difference)} · {recon.status}</p>
          <div style={{ marginBottom: 8 }}>
            <button type="button" className="btn-secondary" onClick={doMatch} disabled={!selected.length}>Match selected</button>{' '}
            <button type="button" className="btn-primary" onClick={() => doComplete(false)}>Complete</button>{' '}
            {isAdmin && <button type="button" className="btn-secondary" onClick={() => doComplete(true)}>Complete with adjustment</button>}
          </div>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {lines.map((l) => (
              <li key={l.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <label>
                  <input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} />{' '}
                  {l.entry_date} {l.entry_no} {l.description} Dr {formatRs(l.debit)} Cr {formatRs(l.credit)}
                </label>
              </li>
            ))}
          </ul>
          {lines.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No unreconciled lines.</p>}
        </div>
      )}
    </div>
  );
};

export const InvoicesPage = () => {
  usePageTitle('Invoices');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listInvoices().then((d) => setRows(rowsOf(d))).catch(() => toast.error('Failed')).finally(() => setLoading(false));
  }, []);
  if (loading) return <AppLoader inline message="Loading invoices…" />;
  return (
    <div className="card" style={{ padding: 0 }}>
      <DataTable
        variant="erp" pageSize={25} emptyTitle="No invoices yet"
        columns={[
          { key: 'invoice_no', label: 'Invoice' }, { key: 'customer_name', label: 'Customer' },
          { key: 'invoice_date', label: 'Date' }, { key: 'total', label: 'Total' },
          { key: 'amount_paid', label: 'Paid' }, { key: 'balance_due', label: 'Due' }, { key: 'status', label: 'Status' },
        ]}
        data={rows}
        renderCell={(r, k) => (['total', 'amount_paid', 'balance_due'].includes(k) ? formatRs(r[k]) : (r[k] ?? '—'))}
      />
    </div>
  );
};

export const FiscalPeriodsPage = () => {
  usePageTitle('Fiscal Periods');
  const [rows, setRows] = useState([]);
  const { isAdmin } = usePermissions();
  const load = () => listFiscalPeriods().then((d) => setRows(rowsOf(d)));
  useEffect(() => { load(); }, []);
  return (
    <div className="card" style={{ padding: 0 }}>
      <DataTable
        variant="erp" emptyTitle="No periods" pageSize={20}
        columns={[
          { key: 'name', label: 'Name' }, { key: 'start_date', label: 'Start' },
          { key: 'end_date', label: 'End' }, { key: 'is_closed', label: 'Closed' }, { key: 'actions', label: '' },
        ]}
        data={rows}
        renderCell={(r, k) => {
          if (k === 'is_closed') return r.is_closed ? 'Yes' : 'No';
          if (k === 'actions' && isAdmin) {
            return r.is_closed
              ? <button type="button" className="btn-secondary" style={{ fontSize: 11 }} onClick={() => reopenFiscalPeriod(r.id).then(load)}>Reopen</button>
              : <button type="button" className="btn-secondary" style={{ fontSize: 11 }} onClick={() => closeFiscalPeriod(r.id).then(load)}>Close</button>;
          }
          return r[k] ?? '—';
        }}
      />
    </div>
  );
};

const emptyOpeningLines = () => ([
  { account_code: '1000', debit: '', credit: '', description: 'Opening cash' },
  { account_code: '3900', debit: '', credit: '', description: 'Opening balance equity' },
]);

export const OpeningBalancesPage = () => {
  usePageTitle('Opening Balances');
  const [accounts, setAccounts] = useState([]);
  const [lines, setLines] = useState(emptyOpeningLines);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = usePermissions();

  const reload = async () => {
    setLoading(true);
    try {
      const [acctData, ob] = await Promise.all([listAccounts(), getOpeningBalances()]);
      setAccounts(rowsOf(acctData));
      setExisting(ob?.posted ? ob.entry : null);
    } catch {
      toast.error('Failed to load opening balances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  if (!isAdmin) return <div className="card" style={{ padding: 16 }}>Admin only.</div>;
  if (loading) return <AppLoader inline message="Loading opening balances…" />;

  const submit = async (e) => {
    e.preventDefault();
    try {
      await postOpeningBalances({
        entry_date: todayISO(),
        lines: lines.map((l) => ({
          account_code: l.account_code,
          debit: l.debit || 0,
          credit: l.credit || 0,
          description: l.description || 'Opening',
        })),
      });
      toast.success('Opening balances posted');
      setLines(emptyOpeningLines());
      await reload();
    } catch (err) {
      const d = err?.response?.data;
      toast.error(d?.detail || (d && JSON.stringify(d)) || 'Failed — must balance and only once');
    }
  };

  const doReverse = async () => {
    if (!existing?.id) return;
    const reason = window.prompt('Reason for reversing opening balances?', 'Re-enter opening');
    if (reason == null) return;
    try {
      await reverseJournalEntry(existing.id, { reason });
      toast.success('Opening reversed — you can post again');
      await reload();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Reverse failed');
    }
  };

  if (existing) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <p style={{ marginTop: 0 }}>Opening balances already posted as <strong>{existing.entry_no}</strong> on {existing.entry_date}.</p>
        <p style={{ color: 'var(--text-muted)' }}>Reverse this entry before posting a new opening journal.</p>
        <ul style={{ marginBottom: 16 }}>
          {(existing.lines || []).map((ln) => (
            <li key={ln.id}>
              {ln.account_code || ln.account} — Dr {formatRs(ln.debit)} / Cr {formatRs(ln.credit)}
              {ln.description ? ` (${ln.description})` : ''}
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secondary" onClick={doReverse}>Reverse opening</button>
      </div>
    );
  }

  return (
    <form className="card" style={{ padding: 16 }} onSubmit={submit}>
      <p style={{ color: 'var(--text-muted)' }}>Debits must equal credits (e.g. Cash debit + Opening Balance Equity credit). Do not use fake payments.</p>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <select value={l.account_code} onChange={(e) => {
            const next = [...lines]; next[i] = { ...l, account_code: e.target.value }; setLines(next);
          }}>
            {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} {a.name}</option>)}
          </select>
          <input placeholder="Debit" value={l.debit} onChange={(e) => { const next = [...lines]; next[i] = { ...l, debit: e.target.value }; setLines(next); }} />
          <input placeholder="Credit" value={l.credit} onChange={(e) => { const next = [...lines]; next[i] = { ...l, credit: e.target.value }; setLines(next); }} />
          <input placeholder="Description" value={l.description} onChange={(e) => { const next = [...lines]; next[i] = { ...l, description: e.target.value }; setLines(next); }} />
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => setLines([...lines, { account_code: '3900', debit: '', credit: '', description: '' }])}>Add line</button>{' '}
      <button type="submit" className="btn-primary">Post opening</button>
    </form>
  );
};
