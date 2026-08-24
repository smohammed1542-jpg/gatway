import { useEffect, useState } from 'react';
import { listJournalEntries } from '../api/accounting';
import DataTable from '../components/ui/DataTable';
import AuditMeta from '../components/ui/AuditMeta';
import AppLoader from '../components/AppLoader';
import { usePageTitle } from '../context/PageTitleContext';
import { formatRs } from '../utils/currency';
import useEscapeClose from '../hooks/useEscapeClose';
import { X } from 'lucide-react';

const JournalEntries = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  usePageTitle('Journal Entries');
  useEscapeClose(Boolean(selected), () => setSelected(null));

  useEffect(() => {
    let cancelled = false;
    listJournalEntries()
      .then((data) => {
        if (!cancelled) setRows(data.results || data || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <AppLoader inline message="Loading journal entries…" />;

  return (
    <div className="animate-fade-in">
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
          <div className="card" style={{ padding: 20, position: 'sticky', top: 24, alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'monospace' }}>{selected.entry_no}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{selected.memo || '—'}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close entry" style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>
            <table className="erp-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {(selected.lines || []).map((line) => (
                  <tr key={line.id}>
                    <td>{line.account_code} {line.account_name}</td>
                    <td>{formatRs(line.debit)}</td>
                    <td>{formatRs(line.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AuditMeta
              status={selected.status}
              createdBy={selected.created_by_name}
              createdAt={selected.created_at}
              updatedAt={selected.updated_at}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default JournalEntries;
