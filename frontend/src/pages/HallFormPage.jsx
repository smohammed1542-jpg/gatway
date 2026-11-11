import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Sparkles, Building2, FileText, MapPin, Users, ImagePlus,
} from 'lucide-react';
import { createVenue, updateVenue, getVenue } from '../api/venues';
import toast from 'react-hot-toast';
import AppLoader from '../components/AppLoader';
import { usePermissions } from '../hooks/usePermissions';
import { formatRs } from '../utils/currency';
import { resolveMediaUrl } from '../utils/media';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active - available for bookings' },
  { value: 'MAINTENANCE', label: 'Under maintenance - temporarily unavailable' },
  { value: 'INACTIVE', label: 'Inactive - hidden from new bookings' },
];

const emptyForm = {
  name: '',
  location: '',
  capacity: '',
  price_per_day: '',
  description: '',
  status: 'ACTIVE',
};

const sectionTitle = (label) => (
  <h3
    style={{
      fontSize: '13px',
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      color: 'var(--primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      margin: 0,
    }}
  >
    <span style={{ width: '4px', height: '16px', backgroundColor: 'var(--primary)', borderRadius: '2px' }} />
    {label}
  </h3>
);

export default function HallFormPage() {
  const { hallId } = useParams();
  const navigate = useNavigate();
  const { canManage } = usePermissions();
  const isEdit = Boolean(hallId);

  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [existingImage, setExistingImage] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!canManage) {
      toast.error('You do not have permission to manage halls.');
      navigate('/settings?tab=halls');
    }
  }, [canManage, navigate]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (isEdit && hallId) {
          const hall = await getVenue(hallId);
          setForm({
            name: hall.name || '',
            location: hall.location || '',
            capacity: hall.capacity ?? '',
            price_per_day: hall.price_per_day ?? '',
            description: hall.description || '',
            status: hall.status || 'ACTIVE',
          });
          setExistingImage(hall.image || '');
        }
      } catch {
        toast.error('Hall not found');
        navigate('/settings?tab=halls');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isEdit, hallId, navigate]);

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl('');
    return undefined;
  }, [imageFile]);

  const displayImage = previewUrl || (existingImage && !removeImage ? resolveMediaUrl(existingImage) : '');

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setImageFile(file);
    setRemoveImage(false);
  };

  const clearImage = () => {
    setImageFile(null);
    setExistingImage('');
    setRemoveImage(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const statusLabel = STATUS_OPTIONS.find((s) => s.value === form.status)?.label || form.status;
  const dailyRate = parseFloat(form.price_per_day) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      location: form.location.trim(),
      capacity: Number(form.capacity),
      price_per_day: Number(form.price_per_day),
      description: form.description,
      status: form.status,
    };
    try {
      if (isEdit) {
        if (imageFile) {
          await updateVenue(hallId, payload, imageFile);
        } else if (removeImage) {
          await updateVenue(hallId, { ...payload, image: null });
        } else {
          await updateVenue(hallId, payload);
        }
        toast.success('Hall updated');
      } else {
        await createVenue(payload, imageFile);
        toast.success('Hall added');
      }
      navigate('/settings?tab=halls');
    } catch (err) {
      const msg = err.response?.data
        ? Object.values(err.response.data).flat().join(' ')
        : 'Could not save hall';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <AppLoader message="Loading…" />;
  }

  return (
    <div className="animate-fade-in">
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '24px',
            marginBottom: '40px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              onClick={() => navigate('/settings?tab=halls')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
              }}
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                {isEdit ? form.name : 'Set up hall name, capacity, location, and daily rate.'}
              </p>
            </div>
          </div>
          {!isEdit && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: '700',
                textTransform: 'uppercase',
                padding: '6px 12px',
                borderRadius: '20px',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Sparkles size={12} /> New hall
            </span>
          )}
        </div>

        {formError && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '16px 20px',
              color: '#b91c1c',
              fontSize: '14px',
              fontWeight: '600',
              marginBottom: '32px',
            }}
          >
            {formError}
          </div>
        )}

        <div className="booking-layout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {sectionTitle('Hall details')}
              <div className="premium-card form-grid-2 form-grid-2--gap-24" style={{ padding: '28px' }}>
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Hall name</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Grand Ballroom, Royal Hall"
                  />
                </div>
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Location</label>
                  <input
                    required
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Ground Floor, Block A"
                  />
                </div>
              </div>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {sectionTitle('Capacity & pricing')}
              <div className="premium-card form-grid-2 form-grid-2--gap-24" style={{ padding: '28px' }}>
                <div className="input-group">
                  <label>Guest capacity</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    placeholder="e.g. 500"
                  />
                </div>
                <div className="input-group">
                  <label>Price per day (Rs)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.price_per_day}
                    onChange={(e) => setForm({ ...form, price_per_day: e.target.value })}
                    placeholder="e.g. 250000"
                  />
                </div>
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {sectionTitle('Hall photo')}
              <div className="premium-card" style={{ padding: '28px' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImagePick}
                  style={{ display: 'none' }}
                />
                <div
                  style={{
                    borderRadius: '14px',
                    border: '2px dashed var(--border)',
                    overflow: 'hidden',
                    background: 'var(--background)',
                  }}
                >
                  {displayImage ? (
                    <div style={{ position: 'relative' }}>
                      <img
                        src={displayImage}
                        alt="Hall preview"
                        style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => fileInputRef.current?.click()}
                          style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={clearImage}
                          style={{
                            padding: '8px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            background: '#fff',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            color: '#b91c1c',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '100%',
                        padding: '48px 24px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <ImagePlus size={36} style={{ color: 'var(--primary)', opacity: 0.7 }} />
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--secondary)' }}>Upload hall photo</span>
                      <span style={{ fontSize: 12 }}>JPG, PNG or WebP · max 5MB</span>
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {sectionTitle('Description')}
              <div className="premium-card" style={{ padding: '28px' }}>
                <div className="input-group">
                  <label>Hall notes <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Stage setup, parking, AC, catering area, decoration options…"
                    style={{ width: '100%', resize: 'vertical', minHeight: '96px' }}
                  />
                </div>
              </div>
            </section>
          </div>

          <div style={{ position: 'sticky', top: '100px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="premium-card" style={{ padding: 0, overflow: 'hidden', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <div
                style={{
                  backgroundColor: 'var(--primary-light)',
                  padding: '20px 24px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <FileText size={18} color="var(--primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', margin: 0 }}>
                  Hall preview
                </h3>
              </div>

              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    height: '120px',
                    backgroundColor: 'var(--surface-elevated)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                  }}
                >
                  {displayImage ? (
                    <img src={displayImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Building2 size={40} />
                  )}
                </div>

                <div>
                  <p style={{ fontSize: '20px', fontWeight: '800', margin: '0 0 4px 0', color: 'var(--secondary)' }}>
                    {form.name || 'Hall name'}
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={14} />
                    {form.location || 'Location'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <Users size={14} />
                  {form.capacity || '-'} guests
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Daily rate</span>
                  <span style={{ fontSize: '22px', fontWeight: '900', color: 'var(--primary)' }}>
                    {dailyRate > 0 ? formatRs(dailyRate) : '-'}
                  </span>
                </div>

                <span
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    backgroundColor: form.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
                    color: form.status === 'ACTIVE' ? '#166534' : 'var(--text-dim)',
                  }}
                >
                  {statusLabel.split(' - ')[0]}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{ width: '100%', padding: '16px', fontSize: '15px', fontWeight: '800' }}
            >
              {submitting ? 'Saving…' : isEdit ? 'Update Hall' : 'Create Hall'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/settings?tab=halls')}
              className="btn-secondary"
              style={{ width: '100%', padding: '14px', fontWeight: '700' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
