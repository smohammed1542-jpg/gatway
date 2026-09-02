import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Layers } from 'lucide-react';
import {
  listCostCenters, createCostCenter, updateCostCenter,
} from '../../api/accounting';
import DataTable from '../../components/ui/DataTable';
import ErpPageShell from '../../components/ui/ErpPageShell';
import ErpFormDialog from '../../components/ui/ErpFormDialog';
import AppLoader from '../../components/AppLoader';
import StatusBadge from '../../components/ui/StatusBadge';
import { usePageTitle } from '../../context/PageTitleContext';
import { rowsOf } from '../../utils/accountingUi';
import { usePermissions } from '../../hooks/usePermissions';

const KINDS = [
  { value: 'COST', label: 'Cost Center' },
  { value: 'PROFIT', label: 'Profit Center' },
];

const emptyForm = { code: '', name: '', kind: 'COST', is_active: true };

export const CostCentersPage = () => {
  usePageTitle('Cost Centers');
  const { canManage } = usePermissions();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState('ALL');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    listCostCenters()
      .then((d) => setRows(rowsOf(d)))
      .catch(() => toast.error('Failed to load cost centers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (filter === 'ACTIVE') return r.is_active;
    if (filter === 'INACTIVE') return !r.is_active;
    return true;
  });

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      code: row.code || '',
      name: row.name || '',
      kind: row.kind || 'COST',
      is_active: row.is_active !== false,
    });
    setShowForm(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateCostCenter(editing.id, form);
        toast.success('Cost center updated');
      } else {
        await createCostCenter(form);
        toast.success('Cost center created');
      }
      closeForm();
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ErpPageShell
        description="Master data for cost and profit center reporting on journal lines."
        actions={canManage && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> New center
          </button>
        )}
        toolbar={(
          <div className="erp-filter-pills">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'ACTIVE', label: 'Active' },
              { id: 'INACTIVE', label: 'Inactive' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`erp-filter-pill${filter === tab.id ? ' erp-filter-pill--active' : ''}`}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      >
        {loading ? (
          <AppLoader inline message="Loading cost centers…" />
        ) : (
          <div className="erp-card erp-card--flat">
            <DataTable
              variant="erp"
              sortable
              showColumnChooser
              pageSize={25}
              emptyTitle="No cost centers"
              emptyDescription="Create cost or profit centers to tag journal lines and filter reports."
              columns={[
                { key: 'code', label: 'Code', sortable: true },
                { key: 'name', label: 'Name', sortable: true },
                { key: 'kind', label: 'Type', sortable: true },
                { key: 'is_active', label: 'Status', sortable: true },
              ]}
              data={filtered}
              renderCell={(row, key) => {
                if (key === 'kind') {
                  return KINDS.find((k) => k.value === row.kind)?.label || row.kind;
                }
                if (key === 'is_active') {
                  return <StatusBadge status={row.is_active ? 'ACTIVE' : 'INACTIVE'} />;
                }
                return row[key] ?? '—';
              }}
              rowActions={canManage ? (row) => [{
                label: 'Edit',
                onClick: () => openEdit(row),
              }] : undefined}
              onRowClick={canManage ? openEdit : undefined}
            />
          </div>
        )}
      </ErpPageShell>

      <ErpFormDialog
        open={showForm}
        onClose={() => { if (!saving) closeForm(); }}
        title={editing ? 'Edit cost center' : 'New cost center'}
        subtitle="Dimension tag for journal lines and GL reports"
        icon={Layers}
        ariaLabelledBy="cost-center-form-title"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="cost-center-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      >
        <form id="cost-center-form" onSubmit={onSubmit}>
          <div className="erp-dialog__form-grid">
            <div className="erp-field">
              <label htmlFor="cc-code">Code</label>
              <input
                id="cc-code"
                required
                autoFocus
                placeholder="e.g. CC-HALL"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="erp-field">
              <label htmlFor="cc-kind">Type</label>
              <select
                id="cc-kind"
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
            <div className="erp-field erp-field--full">
              <label htmlFor="cc-name">Name</label>
              <input
                id="cc-name"
                required
                placeholder="e.g. Hall operations"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="erp-field erp-field--full">
              <label className="erp-field__check" htmlFor="cc-active">
                <input
                  id="cc-active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active — available for new journal lines
              </label>
            </div>
          </div>
        </form>
      </ErpFormDialog>
    </>
  );
};

export default CostCentersPage;
