import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User as UserIcon,
  X,
  Edit2,
  Printer,
  CreditCard,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, eachDayOfInterval, parseISO } from 'date-fns';
import client from '../api/client';
import { formatRs, formatCollectDue, bookingCollectDue, hasCollectDue } from '../utils/currency';
import toast from 'react-hot-toast';
import { usePermissions } from '../hooks/usePermissions';
import CancelBookingModal from '../components/bookings/CancelBookingModal';

const slotLabel = (slot) => (slot === 'morning' ? 'Morning (12pm – 4pm)' : 'Evening (7pm – 11pm)');

const BookingCalendar = () => {
  const navigate = useNavigate();
  const { canAccessPayments, canManage, canOperate } = usePermissions();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [halls, setHalls] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  
  const [decorationPackages, setDecorationPackages] = useState([]);
  const [selectedDecorationId, setSelectedDecorationId] = useState('');

  const [formData, setFormData] = useState({
    customer: '',
    venue: '',
    event_name: '',
    event_date: '',
    slot: 'evening',
    gents_count: '',
    ladies_count: '',
    rate_per_head: '1200',
    advance_paid: '0',
    booking_status: 'CONFIRMED',
    decoration_charge: '0',
  });
  const [bookingError, setBookingError] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [bookRes, hallsRes, custRes, decoRes] = await Promise.all([
        client.get('/bookings/'),
        client.get('/venues/'),
        client.get('/customers/'),
        client.get('/decorations/packages/?is_active=true').catch(() => ({ data: [] })),
      ]);
      
      const list = bookRes.data.results || bookRes.data || [];
      setBookings(
        list.map((b) => ({
          ...b,
          dateObj: b.event_date
            ? parseISO(b.event_date)
            : b.start_date
              ? parseISO(b.start_date)
              : new Date(),
        }))
      );
      const hallList = hallsRes.data.results || hallsRes.data || [];
      setHalls(hallList.filter((h) => h.status !== 'INACTIVE'));
      setCustomers(custRes.data.results || custRes.data || []);
      const decoData = decoRes.data?.results || decoRes.data || [];
      setDecorationPackages(Array.isArray(decoData) ? decoData.filter((p) => p.is_active !== false) : []);
    } catch (err) {
      toast.error('Failed to load calendar data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (date = null) => {
    setBookingError('');
    const eventDate = date ? format(date, 'yyyy-MM-dd') : format(selectedDate, 'yyyy-MM-dd');
    setFormData({
      customer: '',
      venue: '',
      event_name: '',
      event_date: eventDate,
      slot: 'evening',
      gents_count: '',
      ladies_count: '',
      rate_per_head: '1200',
      advance_paid: '0',
      booking_status: 'CONFIRMED',
      decoration_charge: '0',
    });
    setSelectedDecorationId('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBookingError('');

    // Frontend capacity check
    const selectedHall = halls.find((h) => String(h.id) === String(formData.venue));
    const gents = parseInt(formData.gents_count, 10) || 0;
    const ladies = parseInt(formData.ladies_count, 10) || 0;
    const totalGuests = gents + ladies;
    if (selectedHall && totalGuests > selectedHall.capacity) {
      setBookingError(
        `Total guests (${totalGuests}) exceeds '${selectedHall.name}' capacity of ${selectedHall.capacity} seats.`
      );
      return;
    }

    try {
      const payload = {
        customer: formData.customer,
        venue: formData.venue,
        event_name: formData.event_name,
        event_date: formData.event_date,
        slot: formData.slot,
        gents_count: gents,
        ladies_count: ladies,
        rate_per_head: parseFloat(formData.rate_per_head) || 1200,
        advance_paid: parseFloat(formData.advance_paid) || 0,
        booking_status: formData.booking_status,
        decoration_charge: parseFloat(formData.decoration_charge) || 0,
        decoration_package: selectedDecorationId ? parseInt(selectedDecorationId, 10) : null,
      };
      await client.post('/bookings/', payload);
      toast.success('Booking created');
      setShowModal(false);
      setBookingError('');
      fetchData();
    } catch (err) {
      const errData = err.response?.data;
      const msg = errData?.non_field_errors?.[0]
        || (typeof Object.values(errData || {})?.[0] === 'object' ? Object.values(errData)?.[0]?.[0] : Object.values(errData)?.[0])
        || 'Booking conflict!';
      setBookingError(msg);
      toast.error('Booking failed - see details below');
    }
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getBookingsForDay = (day) => {
    return bookings.filter(booking => isSameDay(booking.dateObj, day));
  };

  const handleBookingClick = (e, booking) => {
    e.stopPropagation();
    setSelectedBooking(booking);
    if (booking.dateObj) setSelectedDate(booking.dateObj);
  };

  const handleViewBooking = () => {
    if (!selectedBooking) return;
    navigate(`/bookings/${selectedBooking.id}`);
  };

  const handleRecordPayment = () => {
    if (!selectedBooking) return;
    navigate('/payments', {
      state: {
        preselectedBookingId: selectedBooking.id,
        bookingEventName: selectedBooking.event_name,
        autoOpenRecord: true,
      },
    });
  };

  const handleCancelComplete = () => {
    setShowCancelModal(false);
    setSelectedBooking(null);
    fetchData();
  };

  const handleDecorationSelect = (packageId) => {
    setSelectedDecorationId(packageId);
    if (!packageId) return;
    const pkg = decorationPackages.find((p) => String(p.id) === String(packageId));
    if (pkg) {
      setFormData((prev) => ({
        ...prev,
        decoration_charge: String(pkg.base_price || 0),
      }));
    }
  };

  return (
    <>
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Visualize your venue schedule and upcoming events.</p>
        </div>
        {canOperate && (
        <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> New Booking
        </button>
        )}
      </div>

      <div className="calendar-layout">
        <div className="card" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>{format(currentDate, 'MMMM yyyy')}</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="btn-secondary" style={{ padding: '8px' }}><ChevronLeft size={20} /></button>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="btn-secondary" style={{ padding: '8px' }}><ChevronRight size={20} /></button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{day}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1, overflow: 'auto' }}>
            {calendarDays.map((day, idx) => {
              const dayBookings = getBookingsForDay(day);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, monthStart);

              return (
                <div key={idx} onClick={() => setSelectedDate(day)} className="calendar-day-cell" style={{ backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--surface)', opacity: isCurrentMonth ? 1 : 0.4 }}>
                  <div style={{ fontSize: '14px', fontWeight: isSelected ? '700' : '500', color: isSelected ? 'var(--primary)' : 'var(--text-main)', marginBottom: '8px' }}>{format(day, 'd')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {dayBookings.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={(e) => handleBookingClick(e, b)}
                        title={`${b.event_name} - click for details`}
                        style={{
                          fontSize: '10px',
                          padding: '4px 6px',
                          backgroundColor: 'var(--primary)',
                          color: 'white',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.02)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(91, 213, 30, 0.35)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        {b.event_name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="premium-card">
            <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CalendarIcon size={20} color="var(--primary)" /> {format(selectedDate, 'PPP')}
            </h3>
            {getBookingsForDay(selectedDate).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {getBookingsForDay(selectedDate).map(booking => (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => setSelectedBooking(booking)}
                    style={{
                      borderLeft: '4px solid var(--primary)',
                      paddingLeft: '16px',
                      paddingTop: '8px',
                      paddingBottom: '8px',
                      textAlign: 'left',
                      background: selectedBooking?.id === booking.id ? 'var(--primary-light)' : 'transparent',
                      borderRadius: '8px',
                      width: '100%',
                      cursor: 'pointer',
                      border: 'none',
                      borderLeftWidth: '4px',
                      borderLeftStyle: 'solid',
                      borderLeftColor: 'var(--primary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: '700' }}>{booking.event_name}</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{booking.customer_name} • {booking.venue_name}</p>
                      <p style={{ fontSize: '12px', fontWeight: '600', color: hasCollectDue(bookingCollectDue(booking)) ? '#b91c1c' : 'var(--text-dim)', marginTop: '4px' }}>
                        Due: {formatCollectDue(bookingCollectDue(booking))}
                      </p>
                    </div>
                    <ChevronRightIcon size={18} color="var(--text-muted)" />
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                <p>No bookings for this day.</p>
                {canOperate && (
                <button type="button" onClick={() => handleOpenModal(selectedDate)} style={{ color: 'var(--primary)', fontWeight: '600', marginTop: '12px', backgroundColor: 'transparent' }}>+ Create One</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {selectedBooking && (
        <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div
            className="card animate-fade-in"
            style={{ width: '100%', maxWidth: '520px', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '12px' }}>
              <div>
                <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'monospace', marginBottom: '4px' }}>
                  {selectedBooking.booking_id || `BK-${selectedBooking.id}`}
                </p>
                <h3 style={{ fontSize: '22px', fontWeight: '800' }}>{selectedBooking.event_name}</h3>
                <span style={{
                  display: 'inline-block',
                  marginTop: '8px',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: '700',
                  backgroundColor: selectedBooking.booking_status === 'CONFIRMED' ? 'var(--primary-light)' : '#fef3c7',
                  color: selectedBooking.booking_status === 'CONFIRMED' ? '#166534' : '#92400e',
                }}>
                  {selectedBooking.booking_status || 'PENDING'}
                </span>
              </div>
              <button type="button" onClick={() => setSelectedBooking(null)} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '4px' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px', fontSize: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <UserIcon size={16} color="var(--text-muted)" />
                <span><strong>Customer:</strong> {selectedBooking.customer_name || '-'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MapPin size={16} color="var(--text-muted)" />
                <span><strong>Hall:</strong> {selectedBooking.venue_name || '-'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CalendarIcon size={16} color="var(--text-muted)" />
                <span>
                  <strong>Date:</strong>{' '}
                  {selectedBooking.event_date
                    ? format(parseISO(selectedBooking.event_date), 'PPP')
                    : format(selectedBooking.dateObj, 'PPP')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={16} color="var(--text-muted)" />
                <span><strong>Slot:</strong> {slotLabel(selectedBooking.slot)}</span>
              </div>
              <div style={{ padding: '14px', backgroundColor: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '13px', marginBottom: '6px' }}>
                  <strong>Guests:</strong> {(selectedBooking.gents_count || 0) + (selectedBooking.ladies_count || 0)} total
                  ({selectedBooking.gents_count || 0} gents, {selectedBooking.ladies_count || 0} ladies)
                </p>
                <p style={{ fontSize: '13px', marginBottom: '6px' }}><strong>Grand total:</strong> {formatRs(selectedBooking.total_price)}</p>
                <p style={{ fontSize: '13px', marginBottom: '6px' }}><strong>Advance paid:</strong> {formatRs(selectedBooking.advance_paid)}</p>
                <p style={{ fontSize: '13px', color: hasCollectDue(bookingCollectDue(selectedBooking)) ? '#b91c1c' : 'var(--text-dim)', fontWeight: '700' }}>
                  <strong>Due:</strong> {formatCollectDue(bookingCollectDue(selectedBooking))}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Payment: <strong>{selectedBooking.payment_status || '-'}</strong>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button type="button" className="btn-primary" onClick={handleViewBooking} style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Edit2 size={18} /> View booking details
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(
                  selectedBooking.booking_status === 'CANCELLED'
                    ? `/print/${selectedBooking.id}?doc=cancellation`
                    : `/print/${selectedBooking.id}`,
                )}
                style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Printer size={18} /> {selectedBooking.booking_status === 'CANCELLED' ? 'Print cancellation' : 'Print Invoice'}
              </button>
              {canAccessPayments && (
                <button type="button" className="btn-secondary" onClick={handleRecordPayment} style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <CreditCard size={18} /> Record Payment
                </button>
              )}
              {canManage && selectedBooking.booking_status !== 'CANCELLED' && selectedBooking.booking_status !== 'COMPLETED' && (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  style={{ width: '100%', padding: '12px', marginTop: '4px', background: 'transparent', color: '#b91c1c', fontWeight: '600', border: '1px solid #fecaca', borderRadius: '8px' }}
                >
                  Cancel Booking
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="card" style={{ width: '100%', maxWidth: '600px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>New Reservation</h3>
              <button onClick={() => setShowModal(false)} style={{ backgroundColor: 'transparent', color: 'var(--text-muted)' }}><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-group">
                <label>Event Name</label>
                <input required value={formData.event_name} onChange={(e) => setFormData({ ...formData, event_name: e.target.value })} placeholder="e.g. Ahmed Wedding" />
              </div>
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Customer</label>
                  <select required value={formData.customer} onChange={(e) => setFormData({ ...formData, customer: e.target.value })}>
                    <option value="">Select Customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{(c.full_name || `${c.first_name || ''} ${c.last_name || ''}`).trim()}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Venue</label>
                  <select
                    required
                    value={formData.venue}
                    onChange={(e) => {
                      const v = halls.find((h) => String(h.id) === String(e.target.value));
                      setFormData({
                        ...formData,
                        venue: e.target.value,
                        rate_per_head: v?.price_per_head || v?.price_per_day || '1200',
                      });
                    }}
                  >
                    <option value="">Select Venue</option>
                    {halls.map((h) => (
                      <option key={h.id} value={h.id}>{h.name} (cap. {h.capacity})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Event Date</label>
                  <input type="date" required value={formData.event_date} onChange={(e) => setFormData({ ...formData, event_date: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Slot</label>
                  <select value={formData.slot} onChange={(e) => setFormData({ ...formData, slot: e.target.value })}>
                    <option value="morning">Morning (12pm – 4pm)</option>
                    <option value="evening">Evening (7pm – 11pm)</option>
                  </select>
                </div>
              </div>
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Gents</label>
                  <input type="number" min="0" required value={formData.gents_count} onChange={(e) => setFormData({ ...formData, gents_count: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Ladies</label>
                  <input type="number" min="0" required value={formData.ladies_count} onChange={(e) => setFormData({ ...formData, ladies_count: e.target.value })} />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Rate per head (Rs)</label>
                  <input type="number" min="0" required value={formData.rate_per_head} onChange={(e) => setFormData({ ...formData, rate_per_head: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Advance paid (Rs)</label>
                  <input type="number" min="0" value={formData.advance_paid} onChange={(e) => setFormData({ ...formData, advance_paid: e.target.value })} />
                </div>
              </div>
              <div className="input-group">
                <label>Decoration package (optional)</label>
                <select value={selectedDecorationId} onChange={(e) => handleDecorationSelect(e.target.value)} style={{ width: '100%', marginBottom: '8px' }}>
                  <option value="">- None -</option>
                  {decorationPackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} - Rs {Number(pkg.base_price || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Decoration charge (Rs)</label>
                <input type="number" min="0" value={formData.decoration_charge} onChange={(e) => setFormData({ ...formData, decoration_charge: e.target.value })} />
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total price is calculated automatically (guests × rate + tax).</p>
              {bookingError && (
                <div style={{
                  backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px',
                  padding: '14px 16px', color: '#b91c1c', fontSize: '13px', fontWeight: '600',
                  lineHeight: '1.5'
                }}>
                  ⚠️ {bookingError}
                </div>
              )}
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px' }}>Confirm Booking</button>
            </form>
          </div>
        </div>
      )}

      <CancelBookingModal
        booking={selectedBooking}
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onCancelled={handleCancelComplete}
      />
    </>
  );
};

export default BookingCalendar;
