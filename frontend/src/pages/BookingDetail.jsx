import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  User,
  Building2,
  CreditCard,
  Printer,
  Edit2,
  Wallet,
  Sparkles,
  FileText,
  XCircle,
} from 'lucide-react';
import CancelBookingModal from '../components/bookings/CancelBookingModal';
import AppLoader from '../components/AppLoader';
import { getBooking } from '../api/bookings';
import client from '../api/client';
import toast from 'react-hot-toast';
import { usePermissions } from '../hooks/usePermissions';
import { usePageTitle } from '../context/PageTitleContext';
import {
  formatRs,
  formatCollectDue,
  bookingCollectDue,
  hasCollectDue,
} from '../utils/currency';

const slotLabel = (slot) =>
  slot === 'morning' ? 'Morning (12pm – 4pm)' : 'Evening (7pm – 11pm)';

const STATUS_STYLE = {
  DRAFT: { bg: '#e2e8f0', color: '#475569', label: 'Draft' },
  PENDING: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
  CONFIRMED: { bg: '#dcfce7', color: '#166534', label: 'Confirmed' },
  COMPLETED: { bg: '#dbeafe', color: '#1e40af', label: 'Completed' },
  CANCELLED: { bg: 'var(--surface-elevated)', color: 'var(--text-dim)', label: 'Cancelled' },
};

const PAYMENT_STYLE = {
  PAID: { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  PARTIAL: { bg: '#fef3c7', color: '#92400e', label: 'Partial' },
  UNPAID: { bg: '#fee2e2', color: '#991b1b', label: 'Unpaid' },
};

const DetailRow = ({ label, value, highlight }) => (
  <div>
    <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
      {label}
    </p>
    <p style={{ fontSize: '15px', fontWeight: highlight ? '800' : '600', color: highlight ? 'var(--primary)' : 'var(--text-main)' }}>
      {value ?? '-'}
    </p>
  </div>
);

const BookingDetail = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { canManage, canAccessPayments } = usePermissions();
  const canEdit = canManage;

  const [booking, setBooking] = useState(null);
  const [inventoryLines, setInventoryLines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  usePageTitle(booking?.event_name || null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await getBooking(bookingId);
        setBooking(data);
        try {
          const invRes = await client.get(`/inventory/booking-items/?booking=${bookingId}`);
          const rows = invRes.data?.results || invRes.data || [];
          setInventoryLines(Array.isArray(rows) ? rows : []);
        } catch {
          setInventoryLines([]);
        }
      } catch {
        toast.error('Booking not found');
        navigate('/bookings');
      } finally {
        setIsLoading(false);
      }
    };
    if (bookingId) load();
  }, [bookingId, navigate]);

  if (isLoading) {
    return <AppLoader message="Loading booking…" />;
  }

  if (!booking) return null;

  const bs = STATUS_STYLE[booking.booking_status] || STATUS_STYLE.PENDING;
  const ps = PAYMENT_STYLE[booking.payment_status] || PAYMENT_STYLE.UNPAID;
  const due = bookingCollectDue(booking);
  const totalGuests = (booking.gents_count || 0) + (booking.ladies_count || 0);
  const isCancelled = booking.booking_status === 'CANCELLED';
  const canCancel = canEdit && !isCancelled && booking.booking_status !== 'COMPLETED';

  const reloadBooking = async () => {
    const data = await getBooking(bookingId);
    setBooking(data);
  };

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
          fontSize: '14px',
        }}
      >
        <ArrowLeft size={18} /> Back
      </button>

      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'monospace', marginBottom: '6px' }}>
            {booking.booking_id || `BK-${booking.id}`}
          </p>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '15px' }}>
            Booking details - yeh reservation ki poori summary hai
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', backgroundColor: bs.bg, color: bs.color }}>
              {bs.label}
            </span>
            <span style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', backgroundColor: ps.bg, color: ps.color }}>
              Payment: {ps.label}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(isCancelled ? `/print/${booking.id}?doc=cancellation` : `/print/${booking.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Printer size={18} /> {isCancelled ? 'Print cancellation' : 'Print'}
          </button>
          {canCancel && (
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#b91c1c',
                fontWeight: '700',
                fontSize: '14px',
              }}
            >
              <XCircle size={18} /> Cancel booking
            </button>
          )}
          {canAccessPayments && due > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                navigate('/payments', {
                  state: {
                    preselectedBookingId: booking.id,
                    bookingEventName: booking.event_name,
                    autoOpenRecord: true,
                  },
                })
              }
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Wallet size={18} /> Record payment
            </button>
          )}
          {canEdit && !isCancelled && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/bookings', { state: { editBookingId: booking.id } })}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Edit2 size={18} /> Edit booking
            </button>
          )}
        </div>
      </div>

      {isCancelled && (
        <div
          className="premium-card"
          style={{
            padding: '20px 24px',
            marginBottom: '24px',
            borderColor: '#fecaca',
            background: '#fef2f2',
          }}
        >
          <p style={{ fontWeight: '800', color: '#991b1b', marginBottom: '8px' }}>This booking has been cancelled</p>
          {booking.cancelled_at && (
            <p style={{ fontSize: '13px', color: '#7f1d1d', marginBottom: '6px' }}>
              Cancelled on: {new Date(booking.cancelled_at).toLocaleString()}
            </p>
          )}
          {booking.cancellation_reason && (
            <p style={{ fontSize: '14px', color: '#7f1d1d', margin: 0 }}>
              Reason: {booking.cancellation_reason}
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="premium-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <Calendar size={18} /> Event
          </h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            <DetailRow label="Event date" value={booking.event_date || '-'} />
            <DetailRow label="Slot" value={slotLabel(booking.slot)} />
            <DetailRow label="Booking date" value={booking.booking_date || '-'} />
            <DetailRow label="Guests" value={`${totalGuests} (${booking.gents_count || 0} gents, ${booking.ladies_count || 0} ladies)`} />
          </div>
        </div>

        <div className="premium-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <User size={18} /> Customer
          </h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            <DetailRow label="Name" value={booking.customer_name} />
            {booking.cnic && <DetailRow label="CNIC" value={booking.cnic} />}
            <Link
              to={`/customers/${booking.customer}`}
              style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)' }}
            >
              View customer profile →
            </Link>
          </div>
        </div>

        <div className="premium-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <Building2 size={18} /> Hall
          </h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            <DetailRow label="Venue" value={booking.venue_name} />
            {booking.venue_capacity != null && (
              <DetailRow label="Capacity" value={`${booking.venue_capacity} seats`} />
            )}
          </div>
        </div>
      </div>

      <div className="premium-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
          <CreditCard size={18} /> Billing
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '20px',
            padding: '20px',
            background: 'var(--background)',
            borderRadius: '12px',
            border: 'none',
          }}
        >
          <DetailRow label="Rate per head" value={formatRs(booking.rate_per_head)} />
          <DetailRow label="Grand total" value={formatRs(booking.total_price)} highlight />
          <DetailRow label="Advance paid" value={formatRs(booking.advance_paid)} />
          <DetailRow
            label="Due"
            value={formatCollectDue(due)}
            highlight={hasCollectDue(due)}
          />
        </div>
      </div>

      <div className="premium-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} /> Extra services
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
          <DetailRow label="Overtime (hrs)" value={booking.overtime_hours ?? 0} />
          <DetailRow label="Kitchen" value={formatRs(booking.kitchen_charge)} />
          <DetailRow
            label="Decoration"
            value={
              booking.decoration_package_name
                ? `${booking.decoration_package_name} - ${formatRs(booking.decoration_charge)}`
                : formatRs(booking.decoration_charge)
            }
          />
          <DetailRow label="Deg count" value={booking.deg_count ?? 0} />
          <DetailRow label="Generator" value={formatRs(booking.generator_charge)} />
        </div>
      </div>

      {inventoryLines.length > 0 && (
        <div className="premium-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} /> Inventory used
          </h3>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {inventoryLines.map((line) => (
              <li
                key={line.id}
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '14px',
                }}
              >
                <strong>{line.item_name || 'Item'}</strong> - {line.quantity_used} {line.item_unit || ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {booking.notes && (
        <div className="premium-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '8px' }}>Notes</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{booking.notes}</p>
        </div>
      )}

      <CancelBookingModal
        booking={booking}
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onCancelled={reloadBooking}
      />
    </div>
  );
};

export default BookingDetail;
