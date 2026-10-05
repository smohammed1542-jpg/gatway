import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Package,
  Edit2,
  Trash2,
  Calendar,
  Layers,
  Tag,
  ChevronRight,
} from 'lucide-react';
import { getInventoryItem } from '../api/inventory';
import client from '../api/client';
import toast from 'react-hot-toast';
import AppLoader from '../components/AppLoader';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../context/PageTitleContext';
import {
  STATUS_COLORS,
  CATEGORY_LABELS,
  getAvailableQty,
} from '../utils/inventoryHelpers';

const InventoryDetail = () => {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [item, setItem] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  usePageTitle(item?.name || null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await getInventoryItem(itemId);
        setItem(data);
        try {
          const res = await client.get(`/inventory/booking-items/?inventory_item=${itemId}`);
          const rows = res.data?.results || res.data || [];
          setAllocations(Array.isArray(rows) ? rows : []);
        } catch {
          setAllocations([]);
        }
      } catch {
        toast.error('Item not found');
        navigate('/inventory');
      } finally {
        setIsLoading(false);
      }
    };
    if (itemId) load();
  }, [itemId, navigate]);

  const handleDelete = async () => {
    if (!window.confirm('Remove this item from inventory?')) return;
    try {
      await client.delete(`/inventory/items/${itemId}/`);
      toast.success('Item removed');
      navigate('/inventory');
    } catch {
      toast.error('Failed to remove item');
    }
  };

  if (isLoading) {
    return <AppLoader message="Loading item…" />;
  }

  if (!item) return null;

  const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.IN_STOCK;
  const allocated = item.allocated_quantity || 0;
  const available = getAvailableQty(item);
  const totalValue = (parseFloat(item.price_per_unit) || 0) * (item.quantity || 0);

  return (
    <div className="animate-fade-in">
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontWeight: '600',
        }}
      >
        <ArrowLeft size={18} /> Back
      </button>

      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'monospace', marginBottom: '6px' }}>
            INV-{item.id}
          </p>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            Inventory item - stock aur event allocations ki detail
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
                backgroundColor: statusStyle.bg,
                color: statusStyle.color,
              }}
            >
              {statusStyle.label}
            </span>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
                backgroundColor: 'var(--surface-elevated)',
                color: 'var(--text-muted)',
              }}
            >
              {CATEGORY_LABELS[item.category] || item.category}
            </span>
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/inventory', { state: { editItemId: item.id } })}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Edit2 size={18} /> Edit item
            </button>
            <button
              type="button"
              onClick={handleDelete}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                background: 'transparent',
                color: '#b91c1c',
                fontWeight: '600',
              }}
            >
              <Trash2 size={18} /> Delete
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="premium-card" style={{ padding: '24px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Package size={14} /> Stock
          </p>
          <p style={{ fontSize: '24px', fontWeight: '900' }}>
            {(Number(item.quantity || 0) + allocated).toLocaleString()} <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-muted)' }}>{item.unit}</span>
          </p>
        </div>
        <div className="premium-card" style={{ padding: '24px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={14} /> Used
          </p>
          <p style={{ fontSize: '24px', fontWeight: '900', color: '#92400e' }}>{allocated.toLocaleString()}</p>
        </div>
        <div className="premium-card" style={{ padding: '24px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Available</p>
          <p style={{ fontSize: '24px', fontWeight: '900', color: available <= 0 ? '#b91c1c' : '#166534' }}>{available.toLocaleString()}</p>
        </div>
        <div className="premium-card" style={{ padding: '24px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Tag size={14} /> Price / unit
          </p>
          <p style={{ fontSize: '22px', fontWeight: '800' }}>
            <span style={{ fontSize: '50%', opacity: 0.7 }}>Rs</span>{' '}
            {parseFloat(item.price_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Stock value: Rs {totalValue.toLocaleString()}
          </p>
        </div>
      </div>

      {item.description && !/unlimited stock/i.test(item.description) && (
        <div className="premium-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '10px' }}>Description</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{item.description}</p>
        </div>
      )}

      {item.last_restocked && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} /> Last restocked: {new Date(item.last_restocked).toLocaleDateString()}
        </p>
      )}

      <div className="premium-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px' }}>
          Used in bookings ({allocations.length})
        </h3>
        {allocations.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Not allocated to any event yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {allocations.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(`/bookings/${row.booking}`)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--background)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <div>
                  <p style={{ fontWeight: '700', fontSize: '14px' }}>{row.booking_event || `Booking #${row.booking}`}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Qty used: {row.quantity_used} {item.unit}
                  </p>
                </div>
                <ChevronRight size={18} color="var(--text-muted)" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryDetail;
