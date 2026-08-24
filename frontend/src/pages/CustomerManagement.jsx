import { useState, useEffect, useCallback, useMemo } from 'react';
import SearchInput from '../components/SearchInput';
import AppLoader from '../components/AppLoader';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  UserPlus,
  Mail,
  Phone,
  Edit2,
  Trash2,
  X,
  Calendar,
  CreditCard,
  MapPin,
  ChevronRight,
  Wallet,
  FileText,
} from 'lucide-react';
import client from '../api/client';
import toast from 'react-hot-toast';
import { customerDisplayName, customerInitials, buildCustomerPayload } from '../utils/customer';
import {
  formatRs,
  formatCollectDue,
  bookingCollectDue,
  hasCollectDue,
} from '../utils/currency';
import { usePermissions } from '../hooks/usePermissions';
import DataTable from '../components/ui/DataTable';
import useEscapeClose from '../hooks/useEscapeClose';

const PAYMENT_STATUS_STYLE = {
  PAID: { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  PARTIAL: { bg: '#fef3c7', color: '#92400e', label: 'Partial - balance due' },
  UNPAID: { bg: '#fee2e2', color: '#991b1b', label: 'Unpaid - amount due' },
};

const CustomerManagement = () => {
  const { canManage, canAccessPayments } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const { customerId: customerIdParam } = useParams();
  const selectedId = customerIdParam ? Number(customerIdParam) : null;
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState({
    full_name: '',
    cnic: '',
    email: '',
    phone: '',
    address: '',
  });

  const [showPayModal, setShowPayModal] = useState(false);
  const [payBooking, setPayBooking] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    payment_method: 'CASH',
    notes: '',
  });
  const [paySubmitting, setPaySubmitting] = useState(false);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const response = await client.get('/customers/');
      setCustomers(response.data.results || response.data || []);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSummary = useCallback(async (customerId) => {
    if (!customerId) return;
    setSummaryLoading(true);
    try {
      const res = await client.get(`/customers/${customerId}/summary/`);
      setSummary(res.data);
    } catch {
      toast.error('Failed to load customer details');
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    const id = location.state?.selectedCustomerId;
    if (id) {
      navigate(`/customers/${id}`, { replace: true, state: {} });
    }
  }, [location.state?.selectedCustomerId, navigate]);

  useEffect(() => {
    if (location.state?.openCreate && canManage) {
      handleOpenFormModal();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openCreate, canManage, navigate, location.pathname]);

  useEffect(() => {
    if (selectedId) fetchSummary(selectedId);
    else setSummary(null);
  }, [selectedId, fetchSummary]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const name = customerDisplayName(c).toLowerCase();
      return (
        name.includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.cnic || '').includes(q)
      );
    });
  }, [customers, searchQuery]);

  const handleSelectCustomer = (customer) => {
    navigate(`/customers/${customer.id}`);
  };

  useEscapeClose(showFormModal, () => setShowFormModal(false));
  useEscapeClose(showPayModal, () => setShowPayModal(false));

  const handleOpenFormModal = (customer = null, e) => {
    e?.stopPropagation();
    if (!canManage) {
      toast.error('You do not have permission to modify customers.');
      return;
    }
    if (customer) {
      setCurrentCustomer({
        ...customer,
        full_name: customer.full_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        cnic: customer.cnic || '',
        email: customer.email || '',
      });
      setIsEditing(true);
    } else {
      setCurrentCustomer({ full_name: '', cnic: '', email: '', phone: '', address: '' });
      setIsEditing(false);
    }
    setShowFormModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentCustomer.full_name?.trim() || !currentCustomer.phone?.trim()) {
      toast.error('Full name and phone are required');
      return;
    }
    const payload = buildCustomerPayload(currentCustomer);
    try {
      if (isEditing) {
        await client.put(`/customers/${currentCustomer.id}/`, payload);
        toast.success('Customer updated');
        if (selectedId === currentCustomer.id) fetchSummary(selectedId);
      } else {
        const res = await client.post('/customers/', payload);
        toast.success('Customer added');
        navigate(`/customers/${res.data.id}`);
      }
      setShowFormModal(false);
      fetchCustomers();
    } catch {
      toast.error('Operation failed');
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (!canManage) return;
    if (!window.confirm('Delete this customer?')) return;
    try {
      await client.delete(`/customers/${id}/`);
      toast.success('Customer deleted');
      if (selectedId === id) navigate('/customers');
      fetchCustomers();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const openBookingDetailPage = (bookingId) => {
    navigate(`/bookings/${bookingId}`);
  };

  const openPayModal = (booking, e) => {
    e?.stopPropagation();
    const remaining = bookingCollectDue(booking);
    setPayBooking(booking);
    setPayForm({
      amount: String(Math.round(remaining)),
      payment_method: 'CASH',
      notes: '',
    });
    setShowPayModal(true);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!payBooking) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    const remaining = bookingCollectDue(payBooking);
    if (amount > remaining + 0.01) {
      toast.error(`Amount cannot exceed remaining balance (${formatRs(remaining)})`);
      return;
    }

    setPaySubmitting(true);
    try {
      await client.post('/finance/payments/', {
        booking: payBooking.id,
        amount,
        payment_method: payForm.payment_method,
        status: 'COMPLETED',
        notes: payForm.notes || `Payment from customer profile - ${customerDisplayName(summary?.customer)}`,
      });
      toast.success('Payment recorded');
      setShowPayModal(false);
      setPayBooking(null);
      fetchSummary(selectedId);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record payment');
    } finally {
      setPaySubmitting(false);
    }
  };

  const selectedCustomer = summary?.customer || customers.find((c) => c.id === selectedId);

  return (
    <>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Click a customer to view bookings, balance due, and record payments.</p>
          </div>
          {canManage && (
          <button type="button" className="btn-primary" onClick={() => handleOpenFormModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={18} /> Add Customer
          </button>
          )}
        </div>

        <div className={`split-layout ${selectedId ? 'split-layout--customers' : ''}`}>
          <div>
            <div className="search-toolbar search-toolbar--compact">
              <SearchInput
                variant="inset"
                placeholder="Search by name, phone, CNIC, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {isLoading ? (
                <AppLoader inline message="Loading customers…" />
              ) : (
                <DataTable
                  variant="erp"
                  sortable
                  showColumnChooser
                  pageSize={25}
                  selectedId={selectedId}
                  emptyTitle="No customers found"
                  emptyDescription="Try another search or add a customer."
                  columns={[
                    { key: 'name', label: 'Customer' },
                    { key: 'phone', label: 'Phone', width: '130px' },
                    { key: 'cnic', label: 'CNIC', width: '140px' },
                    { key: 'outstanding_balance', label: 'Due', width: '110px' },
                  ]}
                  data={filteredCustomers}
                  onRowClick={handleSelectCustomer}
                  getSortValue={(row, key) => {
                    if (key === 'name') return customerDisplayName(row);
                    if (key === 'outstanding_balance') return Number(row.outstanding_balance || 0);
                    return row[key];
                  }}
                  rowActions={(customer) => [
                    { label: 'Open', icon: <ChevronRight size={14} />, onClick: () => handleSelectCustomer(customer) },
                    ...(canManage ? [{ label: 'Edit', icon: <Edit2 size={14} />, onClick: () => handleOpenFormModal(customer) }] : []),
                    ...(canManage ? [{ label: 'Remove', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(customer.id) }] : []),
                  ]}
                  renderCell={(customer, key) => {
                    if (key === 'name') return <span style={{ fontWeight: 700 }}>{customerDisplayName(customer)}</span>;
                    if (key === 'outstanding_balance') {
                      return (
                        <span style={{ fontWeight: 700, color: hasCollectDue(customer.outstanding_balance) ? '#b91c1c' : 'var(--text-dim)' }}>
                          {formatCollectDue(customer.outstanding_balance)}
                        </span>
                      );
                    }
                    return customer[key] || '—';
                  }}
                />
              )}
            </div>
          </div>

          {selectedId && (
            <div className="card" style={{ padding: '24px', position: 'sticky', top: '24px' }}>
              {summaryLoading ? (
                <AppLoader inline message="Loading profile…" />
              ) : selectedCustomer ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '20px', fontWeight: '800' }}>{customerDisplayName(selectedCustomer)}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Customer profile & bookings</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {canManage && (
                      <>
                      <button type="button" onClick={(e) => handleOpenFormModal(selectedCustomer, e)} style={{ padding: '8px', color: 'var(--secondary)', background: 'transparent' }} title="Edit">
                        <Edit2 size={18} />
                      </button>
                      <button type="button" onClick={(e) => handleDelete(selectedId, e)} style={{ padding: '8px', color: '#ef4444', background: 'transparent' }} title="Delete">
                        <Trash2 size={18} />
                      </button>
                      </>
                      )}
                      <button type="button" onClick={() => navigate('/customers')} style={{ padding: '8px', color: 'var(--text-muted)', background: 'transparent' }} title="Close">
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)' }}>
                      <Phone size={16} /> {selectedCustomer.phone}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)' }}>
                      <Mail size={16} /> {selectedCustomer.email || '-'}
                    </div>
                    {selectedCustomer.cnic && (
                      <div style={{ gridColumn: 'span 2', fontFamily: 'monospace', fontSize: '13px' }}>CNIC: {selectedCustomer.cnic}</div>
                    )}
                    {selectedCustomer.address && (
                      <div style={{ gridColumn: 'span 2', display: 'flex', gap: '8px', color: 'var(--text-muted)' }}>
                        <MapPin size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {selectedCustomer.address}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)' }}>
                      <Calendar size={16} /> Joined {new Date(selectedCustomer.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      marginBottom: '24px',
                    }}
                  >
                    <div className="premium-card" style={{ padding: '16px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Total bookings</p>
                      <p style={{ fontSize: '22px', fontWeight: '800', marginTop: '4px' }}>{summary?.bookings_count ?? 0}</p>
                    </div>
                    <div className="premium-card" style={{ padding: '16px', borderColor: hasCollectDue(summary?.total_outstanding) ? '#fecaca' : undefined }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Total balance due</p>
                      <p style={{ fontSize: '22px', fontWeight: '800', marginTop: '4px', color: hasCollectDue(summary?.total_outstanding) ? '#b91c1c' : 'var(--text-dim)' }}>
                        {formatCollectDue(summary?.total_outstanding)}
                      </p>
                    </div>
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => navigate('/bookings', { state: { openCreate: true, prefillCustomer: selectedId } })}
                      style={{
                        width: '100%',
                        marginBottom: '20px',
                        padding: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontWeight: '700',
                      }}
                    >
                      <Calendar size={16} /> New booking
                    </button>
                  )}

                  <h4 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} /> Bookings
                  </h4>

                  {!summary?.bookings?.length ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                      <p style={{ margin: 0 }}>No bookings for this customer yet.</p>
                      {canManage && (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => navigate('/bookings', { state: { openCreate: true, prefillCustomer: selectedId } })}
                          style={{ marginTop: '14px', padding: '10px 18px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                          <Calendar size={16} /> Create first booking
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto' }}>
                      {summary.bookings.map((b) => {
                        const ps = PAYMENT_STATUS_STYLE[b.payment_status] || PAYMENT_STATUS_STYLE.UNPAID;
                        const remaining = bookingCollectDue(b);
                        const canPay = canAccessPayments && remaining > 0;
                        return (
                          <div
                            key={b.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openBookingDetailPage(b.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openBookingDetailPage(b.id);
                              }
                            }}
                            style={{
                              padding: '16px',
                              borderRadius: '12px',
                              border: '1px solid var(--border)',
                              background: '#fafafa',
                              width: '100%',
                              textAlign: 'left',
                              cursor: 'pointer',
                              transition: 'border-color 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--primary)';
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 107, 44, 0.12)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--border)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontWeight: '700', fontSize: '15px' }}>{b.event_name}</p>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                  {b.venue_name} · {b.event_date || '-'} · {b.slot || '-'}
                                </p>
                                {b.booking_id && (
                                  <p style={{ fontSize: '11px', color: 'var(--icon-muted)', marginTop: '2px' }}>{b.booking_id}</p>
                                )}
                              </div>
                              <span
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  backgroundColor: ps.bg,
                                  color: ps.color,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {ps.label}
                              </span>
                              <ChevronRight size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} aria-hidden />
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '8px',
                                marginTop: '12px',
                                fontSize: '13px',
                              }}
                            >
                              <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Total</span>
                                <p style={{ fontWeight: '700' }}>{formatRs(b.total_price)}</p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Paid</span>
                                <p style={{ fontWeight: '700', color: '#166534' }}>{formatRs(b.advance_paid)}</p>
                              </div>
                              <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Due</span>
                                <p style={{ fontWeight: '700', color: hasCollectDue(remaining) ? '#b91c1c' : 'var(--text-dim)' }}>{formatCollectDue(remaining)}</p>
                              </div>
                            </div>
                            {canPay && (
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPayModal(b, e);
                                }}
                                style={{
                                  marginTop: '12px',
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  padding: '10px',
                                  fontSize: '13px',
                                }}
                              >
                                <Wallet size={16} /> Record payment ({formatCollectDue(remaining)})
                              </button>
                            )}
                            <p style={{ fontSize: '11px', color: 'var(--primary)', marginTop: canPay ? '8px' : '12px', fontWeight: '600' }}>
                              Click to view booking details page →
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {showFormModal && (
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
        >
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700' }}>{isEditing ? 'Edit Customer' : 'Add New Customer'}</h3>
              <button type="button" onClick={() => setShowFormModal(false)} aria-label="Close" style={{ backgroundColor: 'transparent', color: 'var(--text-muted)' }}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Full Name</label>
                  <input required value={currentCustomer.full_name || ''} onChange={(e) => setCurrentCustomer({ ...currentCustomer, full_name: e.target.value })} placeholder="Muhammad Ali Khan" />
                </div>
                <div className="input-group">
                  <label>CNIC</label>
                  <input value={currentCustomer.cnic || ''} onChange={(e) => setCurrentCustomer({ ...currentCustomer, cnic: e.target.value })} placeholder="35202-1234567-9" style={{ fontFamily: 'monospace' }} />
                </div>
              </div>
              <div className="input-group">
                <label>Email Address <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input type="email" value={currentCustomer.email || ''} onChange={(e) => setCurrentCustomer({ ...currentCustomer, email: e.target.value })} placeholder="john@example.com" />
              </div>
              <div className="input-group">
                <label>Phone Number</label>
                <input required value={currentCustomer.phone} onChange={(e) => setCurrentCustomer({ ...currentCustomer, phone: e.target.value })} placeholder="0300 1234567" />
              </div>
              <div className="input-group">
                <label>Address</label>
                <textarea value={currentCustomer.address || ''} onChange={(e) => setCurrentCustomer({ ...currentCustomer, address: e.target.value })} rows="2" style={{ width: '100%' }} />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }}>
                {isEditing ? 'Update Customer' : 'Add Customer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showPayModal && payBooking && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={20} /> Record payment
              </h3>
              <button type="button" onClick={() => setShowPayModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                <X size={22} />
              </button>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              <strong>{payBooking.event_name}</strong>
              <br />
              Due: <strong style={{ color: hasCollectDue(bookingCollectDue(payBooking)) ? '#b91c1c' : 'var(--text-dim)' }}>{formatCollectDue(bookingCollectDue(payBooking))}</strong>
            </p>
            <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label>Amount (Rs)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>Payment method</label>
                <select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} style={{ width: '100%' }}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="ONLINE">Online</option>
                </select>
              </div>
              <div className="input-group">
                <label>Notes (optional)</label>
                <input type="text" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Receipt / reference" />
              </div>
              <button type="submit" className="btn-primary" disabled={paySubmitting} style={{ padding: '12px' }}>
                {paySubmitting ? 'Saving…' : 'Confirm payment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default CustomerManagement;
