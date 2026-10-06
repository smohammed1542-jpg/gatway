import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Sparkles, Edit2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLoader from '../components/AppLoader';
import ErpPageShell from '../components/ui/ErpPageShell';
import {
  listHallServicesAll,
  createHallService,
  updateHallService,
  deleteHallService,
} from '../api/hallServices';
import { usePermissions } from '../hooks/usePermissions';
import { formatRs } from '../utils/currency';
import useEscapeClose from '../hooks/useEscapeClose';
import './hall-services.css';

export const HALL_SERVICE_PRICING_OPTIONS = [
  { value: 'PER_EVENT', label: 'Per event', short: '/ event' },
  { value: 'PER_GUEST', label: 'Per guest', short: '/ guest' },
  { value: 'PER_HOUR', label: 'Per hour', short: '/ hour' },
];

function slugCode(label) {
  return String(label || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32) || `SVC_${Date.now()}`;
}

const emptyForm = {
  label: '',
  description: '',
  price: '',
  pricing_unit: 'PER_EVENT',
  sort_order: 0,
};

function pricingMeta(unit) {
  return HALL_SERVICE_PRICING_OPTIONS.find((o) => o.value === unit) || { label: unit, short: unit };
}

function ServiceFormModal({ open, editing, form, saving, onClose, onChange, onSubmit }) {
  useEscapeClose(open && !saving, onClose);
  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div
        className="card modal-panel modal-panel--sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hall-service-modal-title"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h3 id="hall-service-modal-title" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
              {editing ? 'Edit service' : 'Add service'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              DJ, photography, valet, or any extra you charge for an event.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            style={{ backgroundColor: 'transparent', color: 'var(--text-muted)', flexShrink: 0 }}
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="input-group">
            <label>Service name</label>
            <input
              required
              autoFocus
              value={form.label}
              onChange={(e) => onChange({ ...form, label: e.target.value })}
              placeholder="e.g. DJ, Photography, Valet"
            />
          </div>
          <div className="input-group">
            <label>Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              placeholder="What is included (optional)"
            />
          </div>
          <div className="form-grid-2">
            <div className="input-group">
              <label>Price (Rs)</label>
              <input
                required
                type="number"
                min="1"
                step="1"
                value={form.price}
                onChange={(e) => onChange({ ...form, price: e.target.value })}
                placeholder="5000"
              />
            </div>
            <div className="input-group">
              <label>Charged</label>
              <select
                value={form.pricing_unit}
                onChange={(e) => onChange({ ...form, pricing_unit: e.target.value })}
              >
                {HALL_SERVICE_PRICING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Add service'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export default function HallServices() {
  const { canManage } = usePermissions();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listHallServicesAll();
      setServices(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    if (!canManage) {
      toast.error('You do not have permission to manage services.');
      return;
    }
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (svc) => {
    if (!canManage) return;
    setEditing(svc);
    setForm({
      label: svc.label || '',
      description: svc.description || '',
      price: String(svc.price ?? ''),
      pricing_unit: svc.pricing_unit || 'PER_EVENT',
      sort_order: svc.sort_order ?? 0,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.label.trim()) {
      toast.error('Service name is required');
      return;
    }
    const price = Number(form.price);
    if (!price || price <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        description: form.description.trim(),
        price,
        pricing_unit: form.pricing_unit,
        sort_order: Number(form.sort_order) || 0,
        is_active: true,
      };
      if (editing) {
        await updateHallService(editing.id, payload);
        toast.success('Service updated');
      } else {
        await createHallService({ ...payload, code: slugCode(form.label) });
        toast.success('Service added');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.code?.[0] || data?.label?.[0] || data?.detail || 'Could not save service';
      toast.error(typeof msg === 'string' ? msg : 'Could not save service');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (svc) => {
    if (!canManage) return;
    if (!window.confirm(`Remove "${svc.label}" from your services?`)) return;
    try {
      await deleteHallService(svc.id);
      toast.success('Service removed');
      await load();
    } catch {
      toast.error('Failed to remove service');
    }
  };

  const activeServices = services.filter((s) => s.is_active !== false);
  const inactiveServices = services.filter((s) => s.is_active === false);

  return (
    <>
      <ErpPageShell
        className="hall-services"
        description="Add the extras your hall offers — DJ, photography, valet, and anything else you charge for."
        actions={canManage && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={18} aria-hidden /> Add service
          </button>
        )}
      >
        {loading ? (
          <AppLoader inline message="Loading services…" />
        ) : activeServices.length === 0 ? (
          <div className="hall-services__empty">
            <Sparkles size={32} style={{ opacity: 0.35, marginBottom: 10 }} />
            <p className="hall-services__empty-title">No services yet</p>
            <p className="hall-services__empty-text">
              Add DJ, photography, valet, or any other service you offer with events.
            </p>
            {canManage && (
              <button type="button" className="btn-primary" onClick={openCreate}>
                <Plus size={16} aria-hidden /> Add first service
              </button>
            )}
          </div>
        ) : (
          <div className="hall-services__grid">
            {activeServices.map((svc) => {
              const unit = pricingMeta(svc.pricing_unit);
              return (
                <article key={svc.id} className="hall-services__card">
                  <div className="hall-services__card-top">
                    <div className="hall-services__icon" aria-hidden>
                      <Sparkles size={16} />
                    </div>
                    <div className="hall-services__info">
                      <p className="hall-services__name">{svc.label}</p>
                      {svc.description ? (
                        <p className="hall-services__desc">{svc.description}</p>
                      ) : null}
                      <div className="hall-services__price-row">
                        <p className="hall-services__price">{formatRs(svc.price)}</p>
                        <span className="hall-services__unit">{unit.short}</span>
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="hall-services__actions">
                      <button
                        type="button"
                        className="btn-secondary hall-services__action-btn"
                        onClick={() => openEdit(svc)}
                        aria-label={`Edit ${svc.label}`}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-secondary hall-services__action-btn hall-services__action-btn--danger"
                        onClick={() => handleDeactivate(svc)}
                        aria-label={`Remove ${svc.label}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {inactiveServices.length > 0 && (
          <div className="hall-services__inactive">
            <p className="hall-services__inactive-title">
              Removed ({inactiveServices.length})
            </p>
            <div className="hall-services__inactive-list">
              {inactiveServices.map((svc) => (
                <div key={svc.id} className="hall-services__inactive-row">
                  <span>{svc.label}</span>
                  {canManage && (
                    <button
                      type="button"
                      className="btn-secondary hall-services__restore-btn"
                      onClick={async () => {
                        try {
                          await updateHallService(svc.id, { is_active: true });
                          toast.success('Service restored');
                          load();
                        } catch {
                          toast.error('Failed to restore');
                        }
                      }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </ErpPageShell>

      <ServiceFormModal
        open={modalOpen}
        editing={editing}
        form={form}
        saving={saving}
        onClose={() => !saving && setModalOpen(false)}
        onChange={setForm}
        onSubmit={handleSave}
      />
    </>
  );
}
