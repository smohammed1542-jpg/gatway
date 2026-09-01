import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  listJournalEntries, createJournalEntry, postJournalDraft, reverseJournalEntry, listAccounts,
} from '../api/accounting';
import DataTable from '../components/ui/DataTable';
import AuditMeta from '../components/ui/AuditMeta';
import AppLoader from '../components/AppLoader';
import { usePageTitle } from '../context/PageTitleContext';
import { formatRs } from '../utils/currency';
import useEscapeClose from '../hooks/useEscapeClose';
import { rowsOf, todayISO } from '../utils/accountingUi';
import { usePermissions } from '../hooks/usePermissions';
import { X } from 'lucide-react';

const JournalEntries = () => {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    entry_date: todayISO(),
    memo: '',
    post_immediately: true,
    lines: [
      { account_code: '1000', debit: '', credit: '', description: '' },
      { account_code: '4000', debit: '', credit: '', description: '' },
    ],
  });
  const { canManage, isAdmin } = usePermissions();
  usePageTitle('Journal Entries');
  useEscapeClose(Boolean(selected), () => setSelected(null));

  const load = () => {
    setLoading(true);
    Promise.all([listJournalEntries(), listAccounts()])
      .then(([j, a]) => {
        setRows(rowsOf(j));
        setAccounts(rowsOf(a));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await createJournalEntry({
        ...form,
        lines: form.lines.map((l) => ({
          account_code: l.account_code,
          debit: l.debit || 0,
          credit: l.credit || 0,
          description: l.description || '',
        })),
      });
      toast.success('Journal saved');
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed — check balance');
    }
  };

  const doPost = async (row) => {
    try {
      await postJournalDraft(row.id);
      toast.success('Posted');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  const doReverse = async (row) => {
    const reason = window.prompt('Reason for reversal');
    if (reason == null) return;
    try {
      await reverseJournalEntry(row.id, { reason });
      toast.success('Reversed');
      load();
      setSelected(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  if (loading) return <AppLoader inline message="Loading journal entries…" />;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Posted journals are immutable — reverse to correct.</p>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'New Entry'}
          </button>
        )}
      </div>
      {showForm && (
        <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={submit}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            <input style={{ flex: 1 }} placeholder="Memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={form.post_immediately} onChange={(e) => setForm({ ...form, post_immediately: e.target.checked })} />
              Post now
            </label>
          </div>
          {form.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <select value={l.account_code} onChange={(e) => {
                const lines = [...form.lines]; lines[i] = { ...l, account_code: e.target.value }; setForm({ ...form, lines });
              }}>
                {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} {a.name}</option>)}
              </select>
              <input placeholder="Debit" value={l.debit} onChange={(e) => {
                const lines = [...form.lines]; lines[i] = { ...l, debit: e.target.value }; setForm({ ...form, lines });
              }} />
              <input placeholder="Credit" value={l.credit} onChange={(e) => {
                const lines = [...form.lines]; lines[i] = { ...l, credit: e.target.value }; setForm({ ...form, lines });
              }} />
              <input placeholder="Description" value={l.description} onChange={(e) => {
                const lines = [...form.lines]; lines[i] = { ...l, description: e.target.value }; setForm({ ...form, lines });
              }} />
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => setForm({ ...form, lines: [...form.lines, { account_code: '5000', debit: '', credit: '', description: '' }] })}>Add line</button>{' '}
          <button type="submit" className="btn-primary">Save</button>
        </form>
      )}
      <div className={`split-layout ${selected ? 'split-layout--payments' : ''}`}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <DataTable
            variant="erp"
            sortable
            showColumnChooser
            pageSize={25}
            selectedId={selected?.id}
            emptyTitle="No journal entries yet"
            emptyDescription="Confirm a booking or record a payment to post the first entry."
            columns={[
              { key: 'entry_no', label: 'Entry' },
              { key: 'entry_date', label: 'Date' },
              { key: 'source_type', label: 'Source' },
              { key: 'memo', label: 'Memo' },
              { key: 'status', label: 'Status', width: '110px' },
              { key: 'amount', label: 'Debit', width: '120px' },
            ]}
            data={rows}
            onRowClick={setSelected}
            getSortValue={(row, key) => {
              if (key === 'amount') {
                return (row.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
              }
              return row[key];
            }}
            renderCell={(row, key) => {
              if (key === 'entry_no') return <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{row.entry_no}</span>;
              if (key === 'amount') {
                const debit = (row.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
                return formatRs(debit);
              }
              if (key === 'status') {
                return (
                  <span style={{ fontSize: 11, fontWeight: 700 }}>
                    {row.status}
                    {row.reversed_entry ? ' · reversal' : ''}
                  </span>
                );
              }
              return row[key] || '—';
            }}
          />
        </div>
        {selected && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{selected.entry_no}</h3>
              <button type="button" aria-label="Close" onClick={() => setSelected(null)} style={{ background: 'transparent' }}><X size={18} /></button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{selected.memo}</p>
            <AuditMeta createdBy={selected.created_by_name} createdAt={selected.created_at} status={selected.status} />
            <table style={{ width: '100%', fontSize: 13, marginTop: 12 }}>
              <thead>
                <tr><th align="left">Account</th><th align="right">Debit</th><th align="right">Credit</th></tr>
              </thead>
              <tbody>
                {(selected.lines || []).map((l) => (
                  <tr key={l.id}>
                    <td>{l.account_code} {l.account_name}</td>
                    <td align="right">{formatRs(l.debit)}</td>
                    <td align="right">{formatRs(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              {selected.status === 'DRAFT' && canManage && (
                <button type="button" className="btn-primary" onClick={() => doPost(selected)}>Post</button>
              )}
              {selected.status === 'POSTED' && isAdmin && (
                <button type="button" className="btn-secondary" onClick={() => doReverse(selected)}>Reverse</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JournalEntries;
