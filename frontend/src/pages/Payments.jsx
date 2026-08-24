import { useState, useEffect } from 'react';
import SearchInput from '../components/SearchInput';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CreditCard,
  ChevronRight,
  X,
  Plus,
  Trash2,
  Edit2,
  Printer,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  User,
  Phone,
} from 'lucide-react';
import client from '../api/client';
import toast from 'react-hot-toast';
import AppLogo from '../components/AppLogo';
import { BRAND_FULL_NAME } from '../constants/brand';
import {
  formatRs,
  formatCollectDue,
  formatCollectDuePKR,
  bookingCollectDue,
  hasCollectDue,
} from '../utils/currency';
import DataTable from '../components/ui/DataTable';
import AuditMeta from '../components/ui/AuditMeta';
import useEscapeClose from '../hooks/useEscapeClose';
import { isLockedPayment } from '../utils/erp';

const Payments = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateState = location.state;

  const [payments, setPayments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);

  const [searchQuery, setSearchQuery] = useState(navigateState?.bookingEventName || '');
  const [filterMethod, setFilterMethod] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Add/Record payment state
  const [formData, setFormData] = useState({
    booking: navigateState?.preselectedBookingId ? String(navigateState.preselectedBookingId) : '',
    amount: '',
    payment_method: 'CASH',
    status: 'COMPLETED',
    notes: ''
  });

  // Selected Booking specs for real-time ledger preview in modal
  const [selectedBookingSpecs, setSelectedBookingSpecs] = useState(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [payRes, bookRes] = await Promise.all([
        client.get('/finance/payments/'),
        client.get('/bookings/')
      ]);
      setPayments(payRes.data.results || payRes.data || []);
      setBookings(bookRes.data.results || bookRes.data || []);
    } catch (err) {
      toast.error('Failed to load transaction ledgers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (navigateState?.autoOpenRecord && navigateState?.preselectedBookingId) {
      setShowModal(true);
      setFormData((prev) => ({
        ...prev,
        booking: String(navigateState.preselectedBookingId),
      }));
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [navigateState?.autoOpenRecord, navigateState?.preselectedBookingId]);

  // Update selected booking specs when booking dropdown changes in modal
  useEffect(() => {
    if (formData.booking) {
      const selected = bookings.find(b => String(b.id) === String(formData.booking));
      if (selected) {
        const grandTotal = Number(selected.total_price || 0);
        const balancePaid = Number(selected.advance_paid || 0);
        const remaining = Math.max(0, Number(selected.remaining_balance ?? (grandTotal - balancePaid)));

        setSelectedBookingSpecs({
          grandTotal,
          balancePaid,
          remaining
        });

        // Set default input amount to remaining balance if empty
        setFormData(prev => ({
          ...prev,
          amount: prev.amount ? prev.amount : String(Math.round(remaining))
        }));
      }
    } else {
      setSelectedBookingSpecs(null);
    }
  }, [formData.booking, bookings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.booking) {
      toast.error('Please select an active booking');
      return;
    }
    if (Number(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
      };
      if (editingPaymentId) {
        await client.patch(`/finance/payments/${editingPaymentId}/`, payload);
        toast.success('Payment updated');
      } else {
        await client.post('/finance/payments/', payload);
        toast.success('Payment successfully captured!');
      }
      setShowModal(false);
      setEditingPaymentId(null);
      
      // Reset form
      setFormData({
        booking: '',
        amount: '',
        payment_method: 'CASH',
        status: 'COMPLETED',
        notes: ''
      });
      setSelectedBookingSpecs(null);
      if (selectedPayment?.id === editingPaymentId) setSelectedPayment(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to record payment');
    }
  };

  const openEditPayment = (payment) => {
    setEditingPaymentId(payment.id);
    setFormData({
      booking: String(payment.booking),
      amount: String(payment.amount),
      payment_method: payment.payment_method || 'CASH',
      status: payment.status || 'COMPLETED',
      notes: payment.notes || '',
    });
    setShowModal(true);
  };

  const closePaymentModal = () => {
    setShowModal(false);
    setEditingPaymentId(null);
    setSelectedBookingSpecs(null);
    setFormData({
      booking: '',
      amount: '',
      payment_method: 'CASH',
      status: 'COMPLETED',
      notes: '',
    });
  };

  useEscapeClose(showModal, closePaymentModal);
  useEscapeClose(Boolean(selectedPayment), () => setSelectedPayment(null));
  useEscapeClose(showReceiptModal, () => setShowReceiptModal(false));

  const handleDelete = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete/void this transaction? The payment ledger will be reversed!')) {
      try {
        await client.delete(`/finance/payments/${paymentId}/`);
        toast.success('Transaction voided successfully');
        if (selectedPayment?.id === paymentId) setSelectedPayment(null);
        fetchData();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to void transaction');
      }
    }
  };

  const handlePrintSlip = (payment) => {
    setSelectedReceipt(payment);
    setShowReceiptModal(true);
  };

  const triggerThermalPrint = () => {
    const printContent = document.getElementById('thermal-receipt-view').innerHTML;
    const originalContent = document.body.innerHTML;
    
    // Simple window overwrite print strategy
    document.body.innerHTML = `
      <html>
        <head>
          <title>Receipt_PAY-${selectedReceipt.id}</title>
          <style>
            @page { size: A5 portrait; margin: 10mm; }
            @media print {
              body {
                font-family: 'Courier New', monospace;
                padding: 10px;
                color: black;
                background: white;
              }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${printContent}
        </body>
      </html>
    `;
    
    window.print();
    // Restore page
    document.body.innerHTML = originalContent;
    window.location.reload(); // Quick reset state
  };

  // Financial aggregates
  const completedPayments = payments.filter(p => p.status === 'COMPLETED');
  const totalRevenue = completedPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const pendingRevenue = payments.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  
  // Calculate total outstanding billing for context
  const totalBookingsValue = bookings.reduce((sum, b) => sum + Number(b.total_price || 0), 0);

  const filteredPayments = payments.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    const formattedId = `pay-${String(p.id).padStart(5, '0')}`;
    const matchesSearch = (p.booking_event_name || '').toLowerCase().includes(q) ||
                          (p.customer_name || '').toLowerCase().includes(q) ||
                          (p.recorded_by_name || '').toLowerCase().includes(q) ||
                          (p.booking_reference || '').toLowerCase().includes(q) ||
                          (p.venue_name || '').toLowerCase().includes(q) ||
                          (p.payment_method || '').toLowerCase().includes(q) ||
                          (p.transaction_id || '').toLowerCase().includes(q) ||
                          (p.notes || '').toLowerCase().includes(q) ||
                          String(p.id).toLowerCase().includes(q) ||
                          formattedId.includes(q);

    const matchesMethod = filterMethod === 'ALL' || p.payment_method === filterMethod;
    const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;

    return matchesSearch && matchesMethod && matchesStatus;
  });

  return (
    <>
      <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
        {/* HEADER ROW */}
      <div className="page-header">
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
            Monitor booking deposits, manual installments, and overall revenue metrics.
          </p>
        </div>
        
        <button 
          className="btn-primary" 
          onClick={() => setShowModal(true)} 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '12px 24px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          <Plus size={18} /> Record New Deposit
        </button>
      </div>

      {/* METRICS CARDS */}
      <div className="grid-3 grid-3--mb-lg">
        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.05em', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', backgroundColor: '#166534', borderRadius: '50%' }}></span>
            Net Completed Income
          </span>
          <h3 style={{ fontSize: '32px', fontWeight: '900', color: 'var(--secondary)', margin: 0, letterSpacing: '-0.02em' }}>
            <span style={{ fontSize: '50%', fontWeight: '600', opacity: 0.6, marginRight: '4px' }}>PKR</span>
            {totalRevenue.toLocaleString()}
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Cleared bank deposits and cash reserves.</p>
        </div>

        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.05em', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', backgroundColor: '#b45309', borderRadius: '50%' }}></span>
            Pending Transactions
          </span>
          <h3 style={{ fontSize: '32px', fontWeight: '900', color: 'var(--secondary)', margin: 0, letterSpacing: '-0.02em' }}>
            <span style={{ fontSize: '50%', fontWeight: '600', opacity: 0.6, marginRight: '4px' }}>PKR</span>
            {pendingRevenue.toLocaleString()}
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Cheques awaiting clearance or bank verification.</p>
        </div>

        <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.05em', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--primary)', borderRadius: '50%' }}></span>
            Contracted Bookings Volume
          </span>
          <h3 style={{ fontSize: '32px', fontWeight: '900', color: 'var(--secondary)', margin: 0, letterSpacing: '-0.02em' }}>
            <span style={{ fontSize: '50%', fontWeight: '600', opacity: 0.6, marginRight: '4px' }}>PKR</span>
            {totalBookingsValue.toLocaleString()}
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Sum of all invoices booked in active pipeline.</p>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="search-filter-bar">
        <div className="search-filter-bar__search">
          <SearchInput
            variant="inset"
            placeholder="Search by customer, event, staff name, booking ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>Method:</span>
          <select
            className="search-filter-bar__select"
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
          >
            <option value="ALL">All Methods</option>
            <option value="CASH">Cash (نقد)</option>
            <option value="CARD">Card (کارڈ)</option>
            <option value="BANK_TRANSFER">Bank Transfer (بینک)</option>
            <option value="ONLINE">Online Transfer</option>
          </select>
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>Status:</span>
          <select
            className="search-filter-bar__select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="VOIDED">Voided</option>
          </select>
        </div>

        {(searchQuery || filterMethod !== 'ALL' || filterStatus !== 'ALL') && (
          <button 
            className="btn-secondary" 
            onClick={() => {
              setSearchQuery('');
              setFilterMethod('ALL');
              setFilterStatus('ALL');
            }}
            style={{ padding: '10px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}
          >
            Reset Filters
          </button>
        )}
      </div>

      <div className={`split-layout ${selectedPayment ? 'split-layout--payments' : ''}`}>
        <div className="card table-scroll" style={{ padding: 0, borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <p style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', margin: 0 }}>
            Click a row to view customer, order, and payment details
          </p>
          <DataTable
            variant="erp"
            sortable
            showColumnChooser
            pageSize={25}
            selectedId={selectedPayment?.id}
            emptyTitle="No payments match your search"
            emptyDescription="Try another filter or record a deposit."
            columns={[
              { key: 'id', label: 'Payment' },
              { key: 'customer_name', label: 'Customer' },
              { key: 'booking_event_name', label: 'Event / Order' },
              { key: 'recorded_by_name', label: 'Received by' },
              { key: 'booking_remaining', label: 'Due', width: '110px' },
              { key: 'amount', label: 'Amount', width: '120px' },
            ]}
            data={filteredPayments}
            onRowClick={setSelectedPayment}
            getSortValue={(row, key) => {
              if (key === 'amount' || key === 'booking_remaining') return Number(row[key] || 0);
              if (key === 'id') return Number(row.id);
              return row[key];
            }}
            renderCell={(payment, key) => {
              if (key === 'id') {
                return (
                  <div>
                    <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 12 }}>PAY-{String(payment.id).padStart(5, '0')}</span>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {new Date(payment.payment_date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                );
              }
              if (key === 'customer_name') {
                return (
                  <div>
                    <span style={{ fontWeight: 700 }}>{payment.customer_name || '-'}</span>
                    {payment.customer_phone && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{payment.customer_phone}</p>}
                  </div>
                );
              }
              if (key === 'booking_event_name') {
                return (
                  <div>
                    <span style={{ fontWeight: 600 }}>{payment.booking_event_name || '-'}</span>
                    {payment.booking_reference && <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{payment.booking_reference}</p>}
                  </div>
                );
              }
              if (key === 'recorded_by_name') return payment.recorded_by_name || '-';
              if (key === 'booking_remaining') {
                return (
                  <span style={{ fontWeight: 800, color: hasCollectDue(payment.booking_remaining) ? '#b91c1c' : 'var(--text-dim)' }}>
                    {formatCollectDue(payment.booking_remaining)}
                  </span>
                );
              }
              if (key === 'amount') return <span style={{ fontWeight: 800, color: '#166534' }}>{formatRs(payment.amount)}</span>;
              return payment[key];
            }}
          />
        </div>

        {selectedPayment && (
          <div className="card" style={{ padding: '24px', position: 'sticky', top: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800' }}>PAY-{String(selectedPayment.id).padStart(5, '0')}</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Payment & order details</p>
              </div>
              <button type="button" onClick={() => setSelectedPayment(null)} aria-label="Close payment" style={{ background: 'transparent', color: 'var(--text-muted)', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '10px' }}>Customer (jis ne di)</p>
              <p style={{ fontWeight: '700', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={18} /> {selectedPayment.customer_name || '-'}
              </p>
              {selectedPayment.customer_phone && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={14} /> {selectedPayment.customer_phone}
                </p>
              )}
              {selectedPayment.customer_cnic && (
                <p style={{ fontSize: '12px', fontFamily: 'monospace', marginTop: '4px' }}>CNIC: {selectedPayment.customer_cnic}</p>
              )}
            </div>

            <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Order / Booking</p>
              <p style={{ fontWeight: '700', fontSize: '15px' }}>{selectedPayment.booking_event_name}</p>
              <dl style={{ margin: '12px 0 0', fontSize: '13px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
                {selectedPayment.booking_reference && (
                  <>
                    <dt style={{ color: 'var(--text-muted)' }}>Booking ID</dt>
                    <dd style={{ fontFamily: 'monospace', fontWeight: '600' }}>{selectedPayment.booking_reference}</dd>
                  </>
                )}
                <dt style={{ color: 'var(--text-muted)' }}>Hall</dt>
                <dd>{selectedPayment.venue_name || '-'}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Event date</dt>
                <dd>{selectedPayment.event_date || '-'}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Slot</dt>
                <dd style={{ textTransform: 'capitalize' }}>{selectedPayment.booking_slot || '-'}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Status</dt>
                <dd>{selectedPayment.booking_status || '-'}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Order total</dt>
                <dd style={{ fontWeight: '700' }}>{formatRs(selectedPayment.booking_total)}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Paid (total)</dt>
                <dd style={{ color: '#166534', fontWeight: '700' }}>{formatRs(selectedPayment.booking_paid)}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Due</dt>
                <dd style={{ color: hasCollectDue(selectedPayment.booking_remaining) ? '#b91c1c' : 'var(--text-dim)', fontWeight: '700' }}>
                  {formatCollectDue(selectedPayment.booking_remaining)}
                </dd>
              </dl>
            </div>

            <div style={{ marginBottom: '20px', padding: '16px', borderRadius: '12px', background: 'rgba(91, 213, 30, 0.06)', border: '1px solid rgba(91, 213, 30, 0.2)' }}>
              <p style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', marginBottom: '8px' }}>This payment</p>
              <p style={{ fontSize: '26px', fontWeight: '900', color: '#166534' }}>{formatRs(selectedPayment.amount)}</p>
              <p style={{ fontSize: '13px', marginTop: '8px' }}>
                Method: <strong>{selectedPayment.payment_method}</strong> · Status: <strong>{selectedPayment.status}</strong>
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Received by: <strong>{selectedPayment.recorded_by_name || 'Not recorded'}</strong>
              </p>
              {selectedPayment.notes && (
                <p style={{ fontSize: '12px', marginTop: '8px', fontStyle: 'italic' }}>Notes: {selectedPayment.notes}</p>
              )}
              <AuditMeta
                status={selectedPayment.status}
                createdBy={selectedPayment.recorded_by_name}
                createdAt={selectedPayment.created_at || selectedPayment.payment_date}
                updatedAt={selectedPayment.updated_at}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {!isLockedPayment(selectedPayment.status) && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => openEditPayment(selectedPayment)}
                style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Edit2 size={16} /> Edit payment
              </button>
              )}
              <button type="button" className="btn-primary" onClick={() => handlePrintSlip(selectedPayment)} style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Printer size={16} /> Print receipt
              </button>
              {selectedPayment.booking && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigate(`/print/${selectedPayment.booking}`)}
                  style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <FileText size={16} /> View booking invoice
                </button>
              )}
              {selectedPayment.status !== 'VOIDED' && (
              <button
                type="button"
                onClick={() => handleDelete(selectedPayment.id)}
                style={{ padding: '10px', color: '#ef4444', background: 'transparent', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Trash2 size={16} /> Void payment
              </button>
              )}
            </div>
          </div>
        )}
      </div>

      </div>
      {/* RECORD PAYMENT MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '20px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--secondary)', margin: 0 }}>
                  {editingPaymentId ? 'Edit Payment' : 'Record Client Deposit'}
                </h3>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>کلائنٹ ادائیگی ریکارڈ فارم</p>
              </div>
              <button 
                type="button"
                onClick={closePaymentModal}
                aria-label="Close"
                style={{ backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              <div className="input-group">
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', marginBottom: '4px', display: 'block' }}>
                  Select Event / Reservation
                </label>
                <select 
                  required 
                  disabled={!!editingPaymentId}
                  value={formData.booking} 
                  onChange={(e) => setFormData({...formData, booking: e.target.value})}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', opacity: editingPaymentId ? 0.7 : 1 }}
                >
                  <option value="">-- Choose Reservation --</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.event_name} - {b.customer_name || 'Customer'} ({b.event_date || 'no date'}) - Due: {formatCollectDue(bookingCollectDue(b))}
                    </option>
                  ))}
                </select>
              </div>

              {/* Real-time Ledger Preview block inside Modal */}
              {selectedBookingSpecs && (
                <div style={{ 
                  backgroundColor: 'rgba(91, 213, 30, 0.04)', 
                  border: '1.5px dashed rgba(91, 213, 30, 0.2)', 
                  borderRadius: '8px', 
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', tracking: '0.05em' }}>
                    Live Booking Statement:
                  </span>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', textAlign: 'center' }}>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Grand Total</p>
                      <p style={{ fontSize: '12px', fontWeight: '800', color: 'var(--secondary)', margin: 0 }}>
                        PKR {Math.round(selectedBookingSpecs.grandTotal).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Paid So Far</p>
                      <p style={{ fontSize: '12px', fontWeight: '800', color: '#166534', margin: 0 }}>
                        PKR {Math.round(selectedBookingSpecs.balancePaid).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Due</p>
                      <p style={{ fontSize: '12px', fontWeight: '800', color: hasCollectDue(selectedBookingSpecs.remaining) ? '#b91c1c' : 'var(--text-dim)', margin: 0 }}>
                        {formatCollectDuePKR(selectedBookingSpecs.remaining)}
                      </p>
                    </div>
                  </div>

                  {selectedBookingSpecs.remaining <= 0 && (
                    <div style={{ fontSize: '10px', color: '#166534', fontWeight: '700', textAlign: 'center', marginTop: '4px' }}>
                      ✅ This booking is already fully paid in full!
                    </div>
                  )}
                </div>
              )}

              <div className="input-group">
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', marginBottom: '4px', display: 'block' }}>
                  Amount to Pay (PKR)
                </label>
                <input 
                  type="number" 
                  required 
                  value={formData.amount} 
                  onChange={(e) => setFormData({...formData, amount: e.target.value})} 
                  placeholder="0.00"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group">
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', marginBottom: '4px', display: 'block' }}>
                    Payment Method
                  </label>
                  <select 
                    value={formData.payment_method} 
                    onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                  >
                    <option value="CASH">Cash (نقد)</option>
                    <option value="CARD">Credit/Debit Card</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>
                
                <div className="input-group">
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', marginBottom: '4px', display: 'block' }}>
                    Status
                  </label>
                  <select 
                    value={formData.status} 
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                  >
                    <option value="COMPLETED">Completed (وصول شدہ)</option>
                    <option value="PENDING">Pending (انتظار)</option>
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--secondary)', marginBottom: '4px', display: 'block' }}>
                  Transaction Reference / Notes
                </label>
                <textarea 
                  value={formData.notes} 
                  onChange={(e) => setFormData({...formData, notes: e.target.value})} 
                  placeholder="Cheque number, bank transfer receipts or manual slip details..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', minHeight: '40px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                style={{ 
                  width: '100%', 
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  fontSize: '13px',
                  marginTop: '8px'
                }}
              >
                Confirm Payment Deposit
              </button>

            </form>
          </div>
        </div>
      )}

      {/* PRINT SLIP RECEIPT MODAL */}
      {showReceiptModal && selectedReceipt && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyRight: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '24px', borderRadius: '16px', position: 'relative' }}>
            
            {/* Action Bar inside dialog */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setSelectedReceipt(null);
                  setShowReceiptModal(false);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px' }}
              >
                <X size={14} /> Close Preview
              </button>
              
              <button 
                className="btn-primary" 
                onClick={triggerThermalPrint}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', fontSize: '12px' }}
              >
                <Printer size={14} /> Print Receipt
              </button>
            </div>

            {/* Receipt view modeled around 80mm thermal paper */}
            <div id="thermal-receipt-view" style={{ 
              backgroundColor: 'var(--surface)', 
              color: '#000', 
              fontFamily: "'Courier New', monospace", 
              padding: '20px', 
              border: '1px solid #ccc',
              fontSize: '12px',
              lineHeight: '1.4'
            }}>
              <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  <AppLogo size="sm" tone="dark" />
                </div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '900' }}>{BRAND_FULL_NAME.toUpperCase()}</h3>
                <p style={{ margin: 0, fontSize: '10px' }}>Marriage Hall & Events Management</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '9px' }}>Main Chowk Bypass | +92 300 1234567</p>
                <p style={{ margin: '5px 0' }}>--------------------------------</p>
                <h4 style={{ margin: '5px 0', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>PAYMENT TRANSACTION RECEIPT</h4>
                <p style={{ margin: '5px 0' }}>--------------------------------</p>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <p style={{ margin: '4px 0' }}><strong>Slip ID:</strong> PAY-{String(selectedReceipt.id).padStart(5, '0')}</p>
                <p style={{ margin: '4px 0' }}><strong>Date:</strong> {new Date(selectedReceipt.payment_date).toLocaleDateString()} {new Date(selectedReceipt.payment_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                <p style={{ margin: '4px 0' }}><strong>Customer:</strong> {selectedReceipt.customer_name || '-'}</p>
                <p style={{ margin: '4px 0' }}><strong>Booking Ref:</strong> {selectedReceipt.booking_event_name}</p>
                <p style={{ margin: '4px 0' }}><strong>Received by:</strong> {selectedReceipt.recorded_by_name || '-'}</p>
                <p style={{ margin: '4px 0' }}><strong>Method:</strong> {selectedReceipt.payment_method}</p>
                <p style={{ margin: '4px 0' }}><strong>Status:</strong> {selectedReceipt.status}</p>
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '10px 0', margin: '15px 0', textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '11px', textTransform: 'uppercase' }}>AMOUNT PAID (وصول رقم)</p>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900' }}>
                  PKR {parseFloat(selectedReceipt.amount || 0).toLocaleString()}
                </h2>
              </div>

              {selectedReceipt.notes && (
                <div style={{ marginBottom: '20px', fontSize: '10px' }}>
                  <p style={{ margin: '0 0 2px 0' }}><strong>Remarks/Notes:</strong></p>
                  <p style={{ margin: 0, fontStyle: 'italic' }}>{selectedReceipt.notes}</p>
                </div>
              )}

              <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                <div style={{ textAlign: 'center', width: '100px' }}>
                  <p style={{ margin: '0 0 15px 0' }}>_________________</p>
                  <p style={{ margin: 0 }}>Client signature</p>
                </div>
                
                <div style={{ textAlign: 'center', width: '100px' }}>
                  <p style={{ margin: '0 0 15px 0' }}>_________________</p>
                  <p style={{ margin: 0 }}>Officer signature</p>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '30px', borderTop: '1px dashed #000', paddingTop: '10px', fontSize: '9px' }}>
                <p style={{ margin: 0 }}>Thank you for choosing Gateway Centre!</p>
                <p style={{ margin: '2px 0 0 0' }}>Software generated ledger document.</p>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
};

export default Payments;
