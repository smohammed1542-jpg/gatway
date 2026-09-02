import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, Trash2, Edit, X, Plus } from 'lucide-react';
import SearchInput from '../components/SearchInput';
import DataTable from '../components/ui/DataTable';
import ErpPageShell from '../components/ui/ErpPageShell';
import StatusBadge from '../components/ui/StatusBadge';
import GhFilterSelect from '../components/guesthouse/GhFilterSelect';
import client from '../api/client';
import toast from 'react-hot-toast';
import AppLoader from '../components/AppLoader';
import {
  TIER_LABELS,
  TIER_STYLES,
  linesToItems,
  emptyPackageForm,
  parsePackageToForm,
} from '../utils/decorationHelpers';
import { usePermissions } from '../hooks/usePermissions';

const TIER_FILTER_OPTIONS = [
  { value: '', label: 'All tiers' },
  ...Object.entries(TIER_LABELS).map(([value, label]) => ({ value, label })),
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'true', label: 'Active only' },
  { value: 'false', label: 'Inactive' },
];

const DecorationPackages = () => {
  const { canManage } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [packages, setPackages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [formData, setFormData] = useState(emptyPackageForm);

  const fetchPackages = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (filterTier) params.append('tier', filterTier);
      if (filterActive === 'true' || filterActive === 'false') params.append('is_active', filterActive);

      const qs = params.toString();
      const url = qs ? `/decorations/packages/?${qs}` : '/decorations/packages/';
      const response = await client.get(url);
      const data = response.data.results || response.data;
      setPackages(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load decoration packages');
      setPackages([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, filterTier, filterActive]);

  useEffect(() => {
    void fetchPackages();
  }, [fetchPackages]);

  const openModal = (pkg = null) => {
    if (!canManage) {
      toast.error('You do not have permission to modify decoration packages.');
      return;
    }
    if (pkg) {
      setEditing(pkg);
      setFormData(parsePackageToForm(pkg));
    } else {
      setEditing(null);
      setFormData(emptyPackageForm);
    }
    setShowModal(true);
  };

  const openPackageDetail = (id) => {
    navigate(`/decoration-packages/${id}`);
  };

  useEffect(() => {
    const editId = location.state?.editPackageId;
    if (!editId || packages.length === 0) return;
    const pkg = packages.find((p) => String(p.id) === String(editId));
    if (pkg) {
      openModal(pkg);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [packages, location.state?.editPackageId, navigate, location.pathname]);

  const parseError = (err) => {
    const d = err.response?.data;
    if (!d) return 'Could not save package';
    if (typeof d === 'string') return d;
    if (d.detail) return String(d.detail);
    const first = Object.entries(d).find(([, v]) => v != null);
    if (first) {
      const [k, v] = first;
      const msg = Array.isArray(v) ? v[0] : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k}: ${msg}`;
    }
    return 'Could not save package';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: formData.name.trim(),
      tier: formData.tier,
      description: formData.description.trim(),
      included_items: linesToItems(formData.included_lines),
      base_price: formData.base_price,
      setup_hours: formData.setup_hours,
      is_active: formData.is_active,
      display_order: formData.display_order,
    };
    try {
      if (editing) {
        await client.put(`/decorations/packages/${editing.id}/`, payload);
        toast.success('Package updated');
      } else {
        await client.post('/decorations/packages/', payload);
        toast.success('Package created');
      }
      setShowModal(false);
      fetchPackages();
    } catch (err) {
      toast.error(parseError(err));
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (!canManage) return;
    if (!window.confirm('Delete this decoration package?')) return;
    try {
      await client.delete(`/decorations/packages/${id}/`);
      toast.success('Package deleted');
      fetchPackages();
    } catch {
      toast.error('Failed to delete package');
    }
  };

  return (
    <>
      <ErpPageShell
        description="Pricing bundles for stage, lighting, florals, and themed décor."
        actions={canManage && (
          <button type="button" className="btn-primary" onClick={() => openModal()}>
            <Plus size={18} /> New package
          </button>
        )}
        toolbar={(
          <div className="search-filter-bar" style={{ margin: 0, flex: 1 }}>
            <div className="search-filter-bar__search">
              <SearchInput
                variant="inset"
                placeholder="Search packages…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <GhFilterSelect
              value={filterTier}
              onChange={setFilterTier}
              options={TIER_FILTER_OPTIONS}
              aria-label="Filter by tier"
              className="decoration-filter-select"
            />
            <GhFilterSelect
              value={filterActive}
              onChange={setFilterActive}
              options={STATUS_FILTER_OPTIONS}
              aria-label="Filter by status"
              className="decoration-filter-select"
            />
          </div>
        )}
      >
        {isLoading ? (
          <AppLoader inline message="Loading packages…" />
        ) : packages.length === 0 ? (
          <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Sparkles size={40} style={{ margin: '0 auto 12px', opacity: 0.35 }} />
            <p style={{ fontSize: '15px', fontWeight: '600', margin: 0 }}>No decoration packages yet</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>Add your first package to quote events faster.</p>
          </div>
        ) : (
          <div className="erp-card erp-card--flat">
            <DataTable
              variant="erp"
              sortable
              showColumnChooser
              pageSize={20}
              columns={[
                { key: 'name', label: 'Package', sortable: true },
                { key: 'tier', label: 'Tier', sortable: true },
                { key: 'base_price', label: 'Base price', sortable: true },
                { key: 'setup_hours', label: 'Setup (h)', sortable: true },
                { key: 'items_count', label: 'Items', sortable: true },
                { key: 'is_active', label: 'Status', sortable: true },
              ]}
              data={packages.map((pkg) => ({
                ...pkg,
                items_count: Array.isArray(pkg.included_items) ? pkg.included_items.length : 0,
              }))}
              getSortValue={(row, key) => {
                if (key === 'base_price' || key === 'setup_hours' || key === 'items_count') {
                  return Number(row[key]) || 0;
                }
                return row[key];
              }}
              renderCell={(row, key) => {
                if (key === 'tier') {
                  const tierStyle = TIER_STYLES[row.tier] || TIER_STYLES.CLASSIC;
                  return (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: tierStyle.bg,
                      color: tierStyle.color,
                    }}
                    >
                      {TIER_LABELS[row.tier] || row.tier}
                    </span>
                  );
                }
                if (key === 'base_price') {
                  return `Rs ${parseFloat(row.base_price || 0).toLocaleString()}`;
                }
                if (key === 'is_active') {
                  return <StatusBadge status={row.is_active ? 'ACTIVE' : 'INACTIVE'} />;
                }
                return row[key] ?? '—';
              }}
              onRowClick={(row) => openPackageDetail(row.id)}
              rowActions={canManage ? (row) => [
                { label: 'Edit', icon: <Edit size={14} />, onClick: () => openModal(row) },
                { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(row.id) },
              ] : undefined}
            />
          </div>
        )}
      </ErpPageShell>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '640px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>{editing ? 'Edit package' : 'New decoration package'}</h3>
              <button type="button" onClick={() => setShowModal(false)} style={{ backgroundColor: 'transparent', color: 'var(--text-muted)' }}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Package name</label>
                  <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Royal Gold Stage" />
                </div>
                <div className="input-group">
                  <label>Tier</label>
                  <select required value={formData.tier} onChange={(e) => setFormData({ ...formData, tier: e.target.value })}>
                    {Object.entries(TIER_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What makes this package special?"
                  style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', resize: 'vertical', minHeight: '72px' }}
                />
              </div>

              <div className="input-group">
                <label>Included items (one per line)</label>
                <textarea
                  value={formData.included_lines}
                  onChange={(e) => setFormData({ ...formData, included_lines: e.target.value })}
                  placeholder={'Stage backdrop with floral arch\nLED walkway pillars\nCeiling fairy lights'}
                  style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', resize: 'vertical', minHeight: '120px', fontFamily: 'inherit' }}
                />
              </div>

              <div className="form-grid-3">
                <div className="input-group">
                  <label>Base price (Rs)</label>
                  <input type="number" required min="0" step="0.01" value={formData.base_price} onChange={(e) => setFormData({ ...formData, base_price: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="input-group">
                  <label>Setup hours</label>
                  <input type="number" required min="1" max="72" value={formData.setup_hours} onChange={(e) => setFormData({ ...formData, setup_hours: parseInt(e.target.value, 10) || 1 })} />
                </div>
                <div className="input-group">
                  <label>Display order</label>
                  <input type="number" min="0" value={formData.display_order} onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value, 10) || 0 })} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                Active (visible for quoting)
              </label>

              <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1, padding: '12px' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 2, padding: '12px' }}>
                  {editing ? 'Update package' : 'Create package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default DecorationPackages;
