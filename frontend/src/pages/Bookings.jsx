import React, { useState, useEffect, useRef } from 'react';
import SearchInput from '../components/SearchInput';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Plus,
  Calendar as CalendarIcon,
  ChevronLeft,
  Trash2,
  Edit2,
  X,
  XCircle,
  FileText,
  Printer,
  CheckCircle,
  Clock,
  HelpCircle,
  ChevronRight,
  Sparkles,
  Package,
  Building2,
  Users,
  Timer,
  UtensilsCrossed,
  Zap,
  ShieldCheck,
  Download,
  ChevronDown,
  Phone,
  IdCard,
  UserPlus
} from 'lucide-react';
import client from '../api/client';
import { formatCollectDue, formatCollectDuePKR, bookingCollectDue, hasCollectDue } from '../utils/currency';
import toast from 'react-hot-toast';
import { customerDisplayName, buildCustomerPayload, GENDER_OPTIONS } from '../utils/customer';
import { usePermissions } from '../hooks/usePermissions';
import { usePageTitle } from '../context/PageTitleContext';
import CancelBookingModal from '../components/bookings/CancelBookingModal';
import CnicScannerPanel from '../components/guesthouse/CnicScannerPanel';
import ScannedGuestPanel from '../components/guesthouse/ScannedGuestPanel';
import { resolveGuestFromIdScan, isPhoneCompleteForAutoSave, saveGuestFromDraft } from '../utils/idCardCustomer';
import DataTable from '../components/ui/DataTable';
import { getTenant } from '../api/core';
import { isPostedBooking, taxRateFromTenant, overtimeRateFromTenant } from '../utils/erp';
import { resolveMediaUrl } from '../utils/media';
import './booking-reservation.css';

const BOOKING_STATUS_STYLE = {
  PENDING: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
  CONFIRMED: { bg: '#dcfce7', color: '#166534', label: 'Confirmed' },
  COMPLETED: { bg: '#dbeafe', color: '#1e40af', label: 'Completed' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled' },
};

const displayNumField = (v) => (v === '' || v === null || v === undefined ? '' : v);

const toIntField = (raw) => {
  if (raw === '') return '';
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? '' : n;
};

const toFloatField = (raw) => {
  if (raw === '') return '';
  const n = parseFloat(raw);
  return Number.isNaN(n) ? '' : n;
};

const numFromApi = (v) => (v === 0 || v === '0' || v == null ? '' : v);

const Bookings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { canManage, canAccessPayments } = usePermissions();
  const [bookings, setBookings] = useState([]);
  const [halls, setHalls] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [decorationPackages, setDecorationPackages] = useState([]);
  const [selectedDecorationId, setSelectedDecorationId] = useState('');
  const [inventoryCatalog, setInventoryCatalog] = useState([]);
  const [inventoryLines, setInventoryLines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'create', 'edit'
  const [editingId, setEditingId] = useState(null);
  const isEdit = viewMode === 'edit';
  usePageTitle(
    viewMode === 'create' ? 'Booking Request' : viewMode === 'edit' ? 'Modify Booking Details' : null,
  );
  
  const [searchQuery, setSearchQuery] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  
  // Primary Form Data
  const [formData, setFormData] = useState({
    event_name: '',
    customer: '',
    venue: '',
    booking_date: new Date().toISOString().split('T')[0],
    event_date: '',
    slot: '',
    gents_count: '',
    ladies_count: '',
    rate_per_head: 1200,
    overtime_hours: '',
    kitchen_charge: '',
    decoration_charge: '',
    deg_count: '',
    generator_charge: '',
    cnic: '',
    advance_paid: '',
    booking_status: 'CONFIRMED'
  });

  // Dual-mode customer state
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    full_name: '',
    cnic: '',
    email: '',
    phone: '',
    gender: '',
    address: ''
  });

  const [bookingError, setBookingError] = useState('');
  const [sopOpen, setSopOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanProcessing, setScanProcessing] = useState(false);
  const [scannedClient, setScannedClient] = useState(null);
  const [savingScannedClient, setSavingScannedClient] = useState(false);
  const savingClientRef = useRef(false);
  const [taxRate, setTaxRate] = useState(0.05);
  const [overtimeRate, setOvertimeRate] = useState(5000);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [bookingsRes, hallsRes, customersRes, decoRes, invRes] = await Promise.all([
        client.get('/bookings/'),
        client.get('/venues/'),
        client.get('/customers/'),
        client.get('/decorations/packages/?is_active=true').catch(() => ({ data: [] })),
        client.get('/inventory/items/').catch(() => ({ data: [] })),
      ]);
      setBookings(bookingsRes.data.results || bookingsRes.data || []);
      setHalls(hallsRes.data.results || hallsRes.data || []);
      const invData = invRes.data?.results || invRes.data || [];
      setInventoryCatalog(Array.isArray(invData) ? invData : []);
      setCustomers(customersRes.data.results || customersRes.data || []);
      const decoData = decoRes.data?.results || decoRes.data || [];
      setDecorationPackages(Array.isArray(decoData) ? decoData.filter((p) => p.is_active !== false) : []);
    } catch (err) {
      toast.error('Failed to load data from server');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    getTenant()
      .then((tenant) => {
        setTaxRate(taxRateFromTenant(tenant));
        setOvertimeRate(overtimeRateFromTenant(tenant));
      })
      .catch(() => {});
  }, []);

  // Recalculate calculations in real-time
  const totalAttendance = Number(formData.gents_count || 0) + Number(formData.ladies_count || 0);
  const subtotal = totalAttendance * Number(formData.rate_per_head || 0);
  
  // Overtime rate: 5000 PKR per hour
  const extraServices = (Number(formData.overtime_hours || 0) * overtimeRate) + 
                        Number(formData.kitchen_charge || 0) + 
                        Number(formData.decoration_charge || 0) + 
                        Number(formData.generator_charge || 0);
                        
  const totalBeforeTax = subtotal + extraServices;
  const taxAmount = totalBeforeTax * taxRate;
  const grandTotal = totalBeforeTax + taxAmount;
  const remainingBalance = grandTotal - Number(formData.advance_paid || 0);
  const isPosted = isPostedBooking(formData.booking_status);

  const resetForm = () => {
    setFormData({
      event_name: '',
      customer: '',
      venue: '',
      booking_date: new Date().toISOString().split('T')[0],
      event_date: '',
      slot: '',
      gents_count: '',
      ladies_count: '',
      rate_per_head: 1200,
      overtime_hours: '',
      kitchen_charge: '',
      decoration_charge: '',
      deg_count: '',
      generator_charge: '',
      cnic: '',
      advance_paid: '',
      booking_status: 'CONFIRMED'
    });
    setNewCustomer({
      full_name: '',
      cnic: '',
      email: '',
      phone: '',
      gender: '',
      address: ''
    });
    setNewCustomerMode(false);
    setBookingError('');
    setSopOpen(false);
    setEditingId(null);
    setSelectedDecorationId('');
    setInventoryLines([]);
    setScannedClient(null);
    setScanProcessing(false);
    setSavingScannedClient(false);
  };

  const selectClientFromScan = (customer) => {
    setCustomers((prev) => {
      const exists = prev.some((c) => c.id === customer.id);
      return exists ? prev.map((c) => (c.id === customer.id ? customer : c)) : [...prev, customer];
    });
    setFormData((prev) => ({
      ...prev,
      customer: String(customer.id),
      cnic: customer.cnic || prev.cnic,
    }));
    setNewCustomerMode(false);
    setScannedClient(null);
    setNewCustomer({
      full_name: '',
      cnic: '',
      email: '',
      phone: '',
      gender: '',
      address: '',
    });
    toast.success(`Client selected: ${customerDisplayName(customer)}`, { id: 'booking-id-scan' });
  };

  const saveClientFromScan = async (clientDraft) => {
    if (savingClientRef.current) return false;
    savingClientRef.current = true;
    setSavingScannedClient(true);
    try {
      const result = await saveGuestFromDraft(clientDraft);
      if (!result.ok) {
        toast.error(result.error || 'Please complete all required fields');
        return false;
      }
      selectClientFromScan(result.customer);
      if (result.created) {
        toast.success(`New client saved: ${customerDisplayName(result.customer)}`, { id: 'booking-id-scan' });
      }
      return true;
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.cnic?.[0] || data?.phone?.[0] || data?.detail || 'Failed to save client';
      toast.error(msg);
      return false;
    } finally {
      savingClientRef.current = false;
      setSavingScannedClient(false);
    }
  };

  const handleIdScan = async (parsed) => {
    if (scanProcessing || isEdit) return;
    setScannedClient(null);
    setScanProcessing(true);
    try {
      const result = await resolveGuestFromIdScan(parsed, { customers });
      if (result.status === 'invalid') {
        toast.error('Could not read ID card. Scan again or upload a clearer photo.');
        return;
      }
      if (result.status === 'existing') {
        selectClientFromScan(result.customer);
        return;
      }
      if (result.status === 'created') {
        selectClientFromScan(result.customer);
        toast.success(`New client saved: ${customerDisplayName(result.customer)}`, { id: 'booking-id-scan' });
        return;
      }
      setScannedClient(result.draft);
      setNewCustomer({ ...result.draft });
      setNewCustomerMode(true);
      toast('ID card read — check fields and add phone', { id: 'booking-id-scan', icon: 'ℹ️' });
    } catch {
      toast.error('Failed to process ID card');
    } finally {
      setScanProcessing(false);
    }
  };

  const handleScannedClientChange = (field, value) => {
    setScannedClient((prev) => (prev ? { ...prev, [field]: value } : prev));
    setNewCustomer((prev) => ({ ...prev, [field]: value }));
  };

  const handleScannedClientPhoneChange = async (value) => {
    if (!scannedClient) return;
    const next = { ...scannedClient, phone: value };
    setScannedClient(next);
    setNewCustomer((prev) => ({ ...prev, phone: value }));
    if (isPhoneCompleteForAutoSave(value)) {
      await saveClientFromScan(next);
    }
  };

  const loadBookingInventory = async (bookingId) => {
    try {
      const res = await client.get(`/inventory/booking-items/?booking=${bookingId}`);
      const rows = res.data.results || res.data || [];
      setInventoryLines(
        rows.map((r) => ({
          id: r.id,
          inventory_item: String(r.inventory_item),
          quantity_used: r.quantity_used,
        }))
      );
    } catch {
      setInventoryLines([]);
    }
  };

  const syncBookingInventory = async (bookingId) => {
    const res = await client.get(`/inventory/booking-items/?booking=${bookingId}`);
    const existing = res.data.results || res.data || [];
    await Promise.all(existing.map((e) => client.delete(`/inventory/booking-items/${e.id}/`)));
    for (const line of inventoryLines) {
      const itemId = parseInt(line.inventory_item, 10);
      const qty = parseInt(line.quantity_used, 10);
      if (!itemId || !qty || qty <= 0) continue;
      await client.post('/inventory/booking-items/', {
        booking: bookingId,
        inventory_item: itemId,
        quantity_used: qty,
      });
    }
  };

  const hallsForSelect = halls.filter(
    (h) => h.status !== 'INACTIVE' || String(h.id) === String(formData.venue)
  );

  const handleCreateNewClick = () => {
    if (!canManage) {
      toast.error('You do not have permission to create bookings.');
      return;
    }
    resetForm();
    setViewMode('create');
  };

  const handleEditClick = (booking) => {
    if (!canManage) {
      toast.error('You do not have permission to edit bookings.');
      return;
    }
    setEditingId(booking.id);
    setFormData({
      event_name: booking.event_name,
      customer: booking.customer,
      venue: booking.venue,
      booking_date: booking.booking_date || new Date().toISOString().split('T')[0],
      event_date: booking.event_date || (booking.start_date ? booking.start_date.split('T')[0] : ''),
      slot: booking.slot || '',
      gents_count: numFromApi(booking.gents_count),
      ladies_count: numFromApi(booking.ladies_count),
      rate_per_head: booking.rate_per_head || 1200,
      overtime_hours: numFromApi(booking.overtime_hours),
      kitchen_charge: numFromApi(booking.kitchen_charge),
      decoration_charge: numFromApi(booking.decoration_charge),
      deg_count: numFromApi(booking.deg_count),
      generator_charge: numFromApi(booking.generator_charge),
      cnic: booking.cnic || '',
      advance_paid: numFromApi(booking.advance_paid),
      booking_status: booking.booking_status || 'CONFIRMED'
    });
    setNewCustomerMode(false);
    setBookingError('');
    setSelectedDecorationId(booking.decoration_package ? String(booking.decoration_package) : '');
    loadBookingInventory(booking.id);
    setViewMode('edit');
  };

  useEffect(() => {
    const editId = location.state?.editBookingId;
    if (!editId || bookings.length === 0) return;
    const booking = bookings.find((b) => String(b.id) === String(editId));
    if (booking) {
      handleEditClick(booking);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [bookings, location.state?.editBookingId]);

  useEffect(() => {
    if (!location.state?.openCreate || !canManage) return;
    const prefillCustomer = location.state?.prefillCustomer;
    handleCreateNewClick();
    if (prefillCustomer) {
      setFormData((prev) => ({ ...prev, customer: String(prefillCustomer) }));
      setNewCustomerMode(false);
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openCreate, location.state?.prefillCustomer, canManage, navigate, location.pathname]);

  const handleDecorationPackageSelect = (packageId) => {
    setSelectedDecorationId(packageId);
    if (!packageId) return;
    const pkg = decorationPackages.find((p) => String(p.id) === String(packageId));
    if (pkg) {
      setFormData((prev) => ({
        ...prev,
        decoration_charge: Number(pkg.base_price) || 0,
      }));
    }
  };

  const handleSaveNewCustomerInline = async () => {
    setBookingError('');
    if (!newCustomer.full_name?.trim() || !newCustomer.phone?.trim() || !newCustomer.gender) {
      setBookingError('Please enter Full Name, Phone Number, and Gender.');
      toast.error('Required fields missing');
      return;
    }
    
    try {
      const customerPayload = buildCustomerPayload(newCustomer);
      const custRes = await client.post('/customers/', customerPayload);
      const savedCust = custRes.data;
      
      // Add the new client to the local customers list so they appear in dropdowns
      setCustomers(prev => [...prev, savedCust]);
      
      // Auto-select this newly created client
      setFormData(prev => ({
        ...prev,
        customer: savedCust.id,
        cnic: savedCust.cnic || newCustomer.cnic || prev.cnic,
      }));
      
      // Switch back to "Select Client" mode to display the selected new client
      setNewCustomerMode(false);
      
      // Clear inline client fields
      setNewCustomer({
        full_name: '',
        cnic: '',
        email: '',
        phone: '',
        gender: '',
        address: ''
      });
      
      toast.success(`Client saved and selected: ${customerDisplayName(savedCust)}`);
    } catch (err) {
      const errData = err.response?.data;
      const msg = errData?.non_field_errors?.[0]
        || (typeof Object.values(errData || {})?.[0] === 'object' ? Object.values(errData)?.[0]?.[0] : Object.values(errData)?.[0])
        || 'Failed to save new client details.';
      setBookingError(msg);
      toast.error('Client saving failed');
    }
  };

  const handleSubmit = async (e, statusOverride) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (isPosted) {
      toast.error('Posted or cancelled bookings cannot be modified.');
      return;
    }
    setBookingError('');

    // Select active venue
    const selectedHall = halls.find(h => String(h.id) === String(formData.venue));
    if (selectedHall && totalAttendance > selectedHall.capacity) {
      setBookingError(
        `Total guest attendance (${totalAttendance}) exceeds '${selectedHall.name}' maximum capacity of ${selectedHall.capacity} seats. Please adjust attendees or choose a larger hall.`
      );
      toast.error('Capacity exceeded');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalCustomerId = formData.customer;

      // 1. If "Create New Customer" is active, call customer API first
      if (newCustomerMode) {
        if (!newCustomer.full_name?.trim() || !newCustomer.phone?.trim() || !newCustomer.gender) {
          setBookingError('Please enter Full Name, Phone Number, and Gender.');
          return;
        }
        const customerPayload = buildCustomerPayload(newCustomer);
        const custRes = await client.post('/customers/', customerPayload);
        finalCustomerId = custRes.data.id;
        toast.success(`Client profile created: ${newCustomer.full_name.trim()}`);
      }

      if (!finalCustomerId) {
        setBookingError('Please select a customer or create a new client profile.');
        return;
      }

      if (!formData.venue) {
        setBookingError('Please select a venue hall.');
        toast.error('Venue required');
        return;
      }

      if (!formData.slot) {
        setBookingError('Please select a timing slot (Morning or Evening).');
        toast.error('Timing required');
        return;
      }

      // 2. Build booking payload (CNIC only when adding a new client)
      const selectedCustomer = customers.find((c) => String(c.id) === String(finalCustomerId));
      const bookingCnic = newCustomerMode
        ? (newCustomer.cnic || '')
        : (selectedCustomer?.cnic || '');
      const payload = {
        ...formData,
        booking_status: statusOverride || formData.booking_status,
        cnic: bookingCnic,
        customer: parseInt(finalCustomerId),
        venue: parseInt(formData.venue),
        gents_count: parseInt(formData.gents_count || 0),
        ladies_count: parseInt(formData.ladies_count || 0),
        rate_per_head: parseFloat(formData.rate_per_head || 0),
        overtime_hours: parseFloat(formData.overtime_hours || 0),
        kitchen_charge: parseFloat(formData.kitchen_charge || 0),
        decoration_charge: parseFloat(formData.decoration_charge || 0),
        decoration_package: selectedDecorationId ? parseInt(selectedDecorationId, 10) : null,
        deg_count: parseInt(formData.deg_count || 0),
        generator_charge: parseFloat(formData.generator_charge || 0),
        advance_paid: parseFloat(formData.advance_paid || 0),
        total_price: parseFloat(grandTotal) // send computed grand total
      };

      let bookingId = editingId;
      if (viewMode === 'edit') {
        await client.put(`/bookings/${editingId}/`, payload);
        toast.success('Reservation updated successfully');
      } else {
        const created = await client.post('/bookings/', payload);
        bookingId = created.data.id;
        toast.success(
          payload.booking_status === 'PENDING'
            ? 'Booking saved as pending'
            : 'Reservation saved successfully'
        );
      }

      if (bookingId) {
        try {
          await syncBookingInventory(bookingId);
        } catch {
          toast.error('Booking saved but inventory allocation failed');
        }
      }

      resetForm();
      setViewMode('list');
      fetchData();
    } catch (err) {
      const errData = err.response?.data;
      const msg = errData?.non_field_errors?.[0]
        || (typeof Object.values(errData || {})?.[0] === 'object' ? Object.values(errData)?.[0]?.[0] : Object.values(errData)?.[0])
        || 'Failed to save booking details.';
      setBookingError(msg);
      toast.error('Reservation failed - check details');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintRowClick = (booking) => {
    const path = booking.booking_status === 'CANCELLED'
      ? `/print/${booking.id}?doc=cancellation`
      : `/print/${booking.id}`;
    navigate(path);
  };



  // Filter list bookings
  const filteredBookings = bookings.filter(b => {
    const q = searchQuery.toLowerCase();
    return (
      (b.event_name || '').toLowerCase().includes(q) ||
      (b.customer_name || '').toLowerCase().includes(q) ||
      (b.venue_name || '').toLowerCase().includes(q) ||
      (b.booking_id || '').toLowerCase().includes(q)
    );
  });

  const selectedCustomer = customers.find((c) => String(c.id) === String(formData.customer));
  const selectedHall = halls.find((h) => String(h.id) === String(formData.venue));
  const selectedCustomerPhone = selectedCustomer?.phone || 'Phone not available';
  const selectedCustomerCnic = selectedCustomer?.cnic || formData.cnic || 'CNIC not available';
  const isClientKycVerified = Boolean(selectedCustomer?.cnic || (newCustomerMode && newCustomer.cnic));
  const galleryHalls = hallsForSelect
    .filter((hall) => hall.status === 'ACTIVE' && hall.image)
    .sort((a, b) => {
      if (String(a.id) === String(formData.venue)) return -1;
      if (String(b.id) === String(formData.venue)) return 1;
      return 0;
    })
    .slice(0, 3);
  const handleDiscardForm = () => {
    resetForm();
    setViewMode('list');
  };
  const handlePendingSubmit = (event) => {
    const form = event.currentTarget.closest('form');
    if (!form?.reportValidity()) return;
    handleSubmit(event, 'PENDING');
  };

  return (
    <div className="animate-fade-in">
        {/* LIST VIEW MODE */}
        {viewMode === 'list' && (
          <>
            <div className="page-header">
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Oversee schedule listings, revenue parameters, and confirm hall draft bookings.</p>
              </div>
              {canManage && (
              <button className="btn-primary" onClick={handleCreateNewClick} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px', fontSize: '14px', fontWeight: '600' }}>
                <Plus size={18} /> New Reservation
              </button>
              )}
            </div>

            {/* Filter Search */}
            <div className="search-toolbar">
              <SearchInput
                variant="inset"
                placeholder="Search reservations by event name, customer first/last name, hall tag, or booking ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <DataTable
                variant="erp"
                sortable
                showColumnChooser
                pageSize={0}
                emptyTitle="No bookings match your criteria"
                emptyDescription="Try another search or create a new booking."
                columns={[
                  { key: 'customer', label: 'Customer / Event' },
                  { key: 'hall', label: 'Hall' },
                  { key: 'date', label: 'Date' },
                  { key: 'status', label: 'Status', width: '110px' },
                  { key: 'payment', label: 'Payment', width: '110px' },
                  { key: 'due', label: 'Due', width: '110px' },
                  { key: 'total', label: 'Total', width: '120px' },
                ]}
                data={filteredBookings}
                getSortValue={(row, key) => {
                  if (key === 'customer') return row.customer_name || row.event_name;
                  if (key === 'hall') return row.venue_name;
                  if (key === 'date') return row.event_date || row.start_date;
                  if (key === 'status') return row.booking_status;
                  if (key === 'payment') return row.payment_status;
                  if (key === 'due') return Number(row.remaining_balance || 0);
                  if (key === 'total') return Number(row.total_price || 0);
                  return row[key];
                }}
                onRowClick={(booking) => handleEditClick(booking)}
                rowActions={(booking) => [
                  ...(canManage ? [{ label: isPostedBooking(booking.booking_status) ? 'View' : 'Edit', icon: <Edit2 size={14} />, onClick: () => handleEditClick(booking) }] : []),
                  { label: 'Print', icon: <Printer size={14} />, onClick: () => handlePrintRowClick(booking) },
                  ...(canManage && !isPostedBooking(booking.booking_status) ? [{ label: 'Cancel', icon: <XCircle size={14} />, danger: true, onClick: () => setCancelTarget(booking) }] : []),
                ]}
                renderCell={(booking, key) => {
                  if (key === 'customer') {
                    return (
                      <div>
                        <p style={{ fontSize: '11px', fontWeight: '600', fontFamily: 'monospace', color: 'var(--text-muted)', marginBottom: '2px' }}>{booking.booking_id || `BK-${booking.id}`}</p>
                        {booking.customer ? (
                          <Link to={`/customers/${booking.customer}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 700, color: 'var(--primary)' }}>{booking.customer_name}</Link>
                        ) : (
                          <span style={{ fontWeight: 700 }}>{booking.customer_name}</span>
                        )}
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{booking.event_name}</p>
                      </div>
                    );
                  }
                  if (key === 'hall') return booking.venue_name;
                  if (key === 'date') {
                    const d = booking.event_date || booking.start_date;
                    return (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                          <CalendarIcon size={14} color="var(--text-muted)" />
                          {d ? new Date(d).toLocaleDateString() : 'N/A'}
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: booking.slot === 'evening' ? '#6366f1' : '#92400e' }}>{booking.slot || 'Morning'}</span>
                      </div>
                    );
                  }
                  if (key === 'status') {
                    const st = BOOKING_STATUS_STYLE[booking.booking_status] || BOOKING_STATUS_STYLE.PENDING;
                    return <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, backgroundColor: st.bg, color: st.color }}>{st.label}</span>;
                  }
                  if (key === 'payment') {
                    return (
                      <span
                        onClick={canAccessPayments ? (e) => { e.stopPropagation(); navigate('/payments', { state: { preselectedBookingId: booking.id, bookingEventName: booking.event_name, autoOpenRecord: booking.payment_status !== 'PAID' } }); } : undefined}
                        style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, backgroundColor: booking.payment_status === 'PAID' ? '#dcfce7' : booking.payment_status === 'PARTIAL' ? '#ffedd5' : '#fee2e2', color: booking.payment_status === 'PAID' ? '#166534' : booking.payment_status === 'PARTIAL' ? '#c2410c' : '#991b1b', cursor: canAccessPayments ? 'pointer' : 'default' }}
                      >
                        {booking.payment_status}
                      </span>
                    );
                  }
                  if (key === 'due') {
                    return <span style={{ fontWeight: 800, color: hasCollectDue(bookingCollectDue(booking)) ? '#b91c1c' : 'var(--text-dim)' }}>{formatCollectDue(bookingCollectDue(booking))}</span>;
                  }
                  if (key === 'total') {
                    return <span style={{ fontWeight: 700 }}>PKR {parseFloat(booking.total_price || 0).toLocaleString()}</span>;
                  }
                  return null;
                }}
              />
            </div>
          </>
        )}

        {/* Compact reservation workspace */}
        {(viewMode === 'create' || viewMode === 'edit') && (
          <form className="reservation-console" onSubmit={handleSubmit}>
            <div className="reservation-console__main">
              <section className="reservation-console__card reservation-console__identity">
                <div className="reservation-console__heading">
                  <h2><CalendarIcon size={13} /> Event &amp; Client Details <span>Step 1 of 3</span></h2>
                  <div className={isClientKycVerified ? 'is-verified' : 'is-pending'}>
                    <ShieldCheck size={11} /> Client KYC {isClientKycVerified ? 'Verified' : 'Pending'}
                  </div>
                </div>

                <div className="reservation-console__event-grid">
                  <label>
                    <span>Booking Identifier</span>
                    <div className="reservation-console__auto-field">
                      <strong>{formData.booking_id || 'BK-2026-AUTO'}</strong>
                      <em>Auto</em>
                    </div>
                  </label>
                  <label>
                    <span>Booking Date</span>
                    <input type="date" required disabled={isEdit} max={formData.event_date || undefined} value={formData.booking_date} onChange={(e) => setFormData({ ...formData, booking_date: e.target.value })} />
                  </label>
                  <label>
                    <span>Event Date *</span>
                    <input type="date" required disabled={isEdit} min={formData.booking_date || new Date().toISOString().split('T')[0]} value={formData.event_date} onChange={(e) => setFormData({ ...formData, event_date: e.target.value })} />
                  </label>
                  <label>
                    <span>Event Title / Occasion</span>
                    <input type="text" required disabled={isEdit} placeholder="Barat Reception Ceremony" value={formData.event_name} onChange={(e) => setFormData({ ...formData, event_name: e.target.value })} />
                  </label>
                </div>

                <div className="reservation-console__client-grid">
                  <label className="reservation-console__client-select">
                    <span>Registered Client Selector</span>
                    <select required={!newCustomerMode} disabled={isEdit || newCustomerMode} value={formData.customer} onChange={(e) => setFormData({ ...formData, customer: e.target.value })}>
                      <option value="">Select registered client</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customerDisplayName(customer)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Phone Contact</span>
                    <div className="reservation-console__readout"><Phone size={11} /> {selectedCustomerPhone}</div>
                  </label>
                  <label>
                    <span>CNIC Identity</span>
                    <div className="reservation-console__readout reservation-console__mono"><IdCard size={11} /> {selectedCustomerCnic}</div>
                  </label>
                  {!isEdit && (
                    <button type="button" className="reservation-console__new-client" onClick={() => { setNewCustomerMode((current) => !current); setScannedClient(null); }}>
                      <UserPlus size={12} /> {newCustomerMode ? 'Select Client' : '+ New Client'}
                    </button>
                  )}
                </div>

                {newCustomerMode && !isEdit && (
                  <div className="reservation-console__new-client-panel">
                    <div className="reservation-console__scanner">
                      <CnicScannerPanel
                        onScan={handleIdScan}
                        disabled={scanProcessing || savingScannedClient}
                      />
                      {scannedClient && (
                        <ScannedGuestPanel
                          draft={scannedClient}
                          loading={scanProcessing}
                          saving={savingScannedClient}
                          onChange={handleScannedClientChange}
                          onPhoneChange={handleScannedClientPhoneChange}
                          onSave={() => saveClientFromScan(scannedClient)}
                          onCancel={() => setScannedClient(null)}
                        />
                      )}
                    </div>
                    <input type="text" required placeholder="Full name" value={newCustomer.full_name} onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })} />
                    <input type="tel" required placeholder="Phone number" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                    <input type="text" placeholder="CNIC" value={newCustomer.cnic} onChange={(e) => setNewCustomer({ ...newCustomer, cnic: e.target.value })} />
                    <select required aria-label="Gender" value={newCustomer.gender} onChange={(e) => setNewCustomer({ ...newCustomer, gender: e.target.value })}>
                      <option value="">Select gender</option>
                      {GENDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input type="email" placeholder="Email (optional)" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
                    <input className="reservation-console__client-address" type="text" placeholder="Residential address" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
                    <button type="button" onClick={handleSaveNewCustomerInline}>Save &amp; Select</button>
                  </div>
                )}
              </section>

              <section className="reservation-console__card reservation-console__venue">
                <div className="reservation-console__venue-selector">
                  <div className="reservation-console__section-label"><Building2 size={12} /> Select Banquet Hall <span>Capacity {selectedHall?.capacity || 0}</span></div>
                  <div className="reservation-console__hall-grid">
                    {hallsForSelect.map((hall) => {
                      const selected = String(formData.venue) === String(hall.id);
                      return (
                        <button key={hall.id} type="button" disabled={isEdit} className={selected ? 'is-selected' : ''} onClick={() => setFormData({ ...formData, venue: hall.id, rate_per_head: hall.price_per_head || 1200 })}>
                          <strong>{hall.name}</strong>
                          <span>{hall.capacity} pax</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="reservation-console__guests">
                  <div className="reservation-console__section-label"><Users size={12} /> Guest Headcount</div>
                  <div className="reservation-console__steppers">
                    {[
                      ['Gents', 'gents_count'],
                      ['Ladies', 'ladies_count'],
                    ].map(([label, field]) => (
                      <div key={field}>
                        <span>{label}</span>
                        <div>
                          <button type="button" disabled={isPosted} onClick={() => setFormData({ ...formData, [field]: Math.max(0, Number(formData[field] || 0) - 10) })}>−</button>
                          <strong>{Number(formData[field] || 0)}</strong>
                          <button type="button" disabled={isPosted || (selectedHall && totalAttendance >= selectedHall.capacity)} onClick={() => setFormData({ ...formData, [field]: Number(formData[field] || 0) + 10 })}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="reservation-console__slot">
                  <div className="reservation-console__section-label"><Timer size={12} /> Time Slot</div>
                  <button type="button" disabled={isEdit} className={formData.slot === 'morning' ? 'is-selected' : ''} onClick={() => setFormData({ ...formData, slot: 'morning' })}><span>Morning</span><small>09am - 03pm</small></button>
                  <button type="button" disabled={isEdit} className={formData.slot === 'evening' ? 'is-selected' : ''} onClick={() => setFormData({ ...formData, slot: 'evening' })}><span>Evening</span><small>06pm - 12am</small></button>
                </div>

                <div className="reservation-console__attendance">
                  <span>Total Attendance</span>
                  <strong>{totalAttendance}</strong>
                  <em>Pax</em>
                  <div><i style={{ width: `${selectedHall ? Math.min(100, (totalAttendance / selectedHall.capacity) * 100) : 0}%` }} /></div>
                  <small>{selectedHall ? `${Math.round((totalAttendance / selectedHall.capacity) * 100) || 0}% Safe Room Limit` : 'Select hall'}</small>
                </div>
              </section>

              <section className="reservation-console__card reservation-console__addons">
                <div className="reservation-console__heading">
                  <h2><UtensilsCrossed size={13} /> Additional Services &amp; Operational Add-ons</h2>
                  <div>Active Modules: <b>{[formData.overtime_hours, formData.kitchen_charge, formData.generator_charge].filter(Boolean).length}</b> <span>PKR {extraServices.toLocaleString()} Total</span></div>
                </div>
                <div className="reservation-console__addon-grid">
                  <label>
                    <span>Overtime <em>{Number(formData.overtime_hours || 0) * overtimeRate >= 1000 ? `${(Number(formData.overtime_hours || 0) * overtimeRate) / 1000}k/hr` : ''}</em></span>
                    <div><input type="number" step=".5" min="0" value={displayNumField(formData.overtime_hours)} onChange={(e) => setFormData({ ...formData, overtime_hours: toFloatField(e.target.value) })} /><b>hrs</b></div>
                  </label>
                  <label>
                    <span>Kitchen Facility</span>
                    <div><b>PKR</b><input type="number" min="0" value={displayNumField(formData.kitchen_charge)} onChange={(e) => setFormData({ ...formData, kitchen_charge: toFloatField(e.target.value) })} /></div>
                  </label>
                  <label>
                    <span>Gen Fuel Backup</span>
                    <div><b>PKR</b><input type="number" min="0" value={displayNumField(formData.generator_charge)} onChange={(e) => setFormData({ ...formData, generator_charge: toFloatField(e.target.value) })} /><Zap size={11} /></div>
                  </label>
                </div>
              </section>

              <section className="reservation-console__card reservation-console__inventory">
                <div className="reservation-console__section-label"><Package size={12} /> Event Inventory</div>
                <div className="reservation-console__inventory-lines">
                  {inventoryLines.map((line, index) => {
                    const item = inventoryCatalog.find((candidate) => String(candidate.id) === String(line.inventory_item));
                    return (
                      <div className="reservation-console__inventory-line" key={line.id || index}>
                        <select value={line.inventory_item} onChange={(e) => { const next = [...inventoryLines]; next[index] = { ...next[index], inventory_item: e.target.value }; setInventoryLines(next); }}>
                          <option value="">Select item</option>
                          {inventoryCatalog.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                        </select>
                        <input type="number" min="1" value={line.quantity_used} onChange={(e) => { const next = [...inventoryLines]; next[index] = { ...next[index], quantity_used: e.target.value }; setInventoryLines(next); }} />
                        <span>{item?.unit || 'units'}</span>
                        <button type="button" onClick={() => setInventoryLines(inventoryLines.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                      </div>
                    );
                  })}
                  <button type="button" className="reservation-console__add-inventory" onClick={() => setInventoryLines([...inventoryLines, { inventory_item: '', quantity_used: 1 }])}>+ Add Custom Item</button>
                </div>
              </section>

              <div className="reservation-console__gallery" aria-label="Available hall photos">
                {galleryHalls.length > 0 ? galleryHalls.map((hall) => (
                  <figure key={hall.id} className={String(hall.id) === String(formData.venue) ? 'is-selected' : ''}>
                    <img src={resolveMediaUrl(hall.image)} alt={`${hall.name} hall`} />
                    <figcaption>
                      <strong>{hall.name}</strong>
                      <span>{hall.location || `${hall.capacity} pax capacity`}</span>
                    </figcaption>
                  </figure>
                )) : (
                  <div className="reservation-console__gallery-empty">
                    No active hall images available. Upload hall photos from Settings → Halls.
                  </div>
                )}
              </div>
            </div>

            <aside className="reservation-console__summary">
              <header>
                <div><h2>Booking Summary</h2><p>REF: {formData.booking_id || 'NEW-RESERVATION'}</p></div>
                <span>● Live</span>
              </header>
              <div className="reservation-console__summary-lines">
                <div><span>Guaranteed Guests</span><b>{totalAttendance} PAX</b></div>
                <div><span>Rate / Head (Standard Menu)</span><label>PKR <input type="number" min="0" disabled={isEdit} value={displayNumField(formData.rate_per_head)} onChange={(e) => setFormData({ ...formData, rate_per_head: toFloatField(e.target.value) })} /></label></div>
                <div><span>Base Food &amp; Venue Charge</span><b>PKR {subtotal.toLocaleString()}</b></div>
                <div><span>Combined Services</span><b>PKR {extraServices.toLocaleString()}</b></div>
                <div><span>Tax Assessment ({(taxRate * 100).toFixed(1).replace(/\.0$/, '')}% GST)</span><b>PKR {taxAmount.toLocaleString()}</b></div>
              </div>
              {isEdit && !isPosted && (
                <label className="reservation-console__status">
                  <span>Reservation Status</span>
                  <select value={formData.booking_status} onChange={(e) => setFormData({ ...formData, booking_status: e.target.value })}>
                    <option value="PENDING">Pending / Tentative Hold</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
              )}
              <div className="reservation-console__grand-total">
                <div><span>Grand Total</span><em>Net Payable</em></div>
                <strong>PKR {grandTotal.toLocaleString()}</strong>
                <small>Inclusive Taxes</small>
              </div>
              <label className="reservation-console__advance">
                <span>Advance Amount Received</span>
                <div>PKR <input type="number" min="0" max={grandTotal || undefined} disabled={isEdit} value={displayNumField(formData.advance_paid)} onChange={(e) => setFormData({ ...formData, advance_paid: toFloatField(e.target.value) })} /></div>
              </label>
              <div className="reservation-console__balance">
                <span>Balance Due</span>
                <strong>{formatCollectDuePKR(remainingBalance)}</strong>
                <small>Pending at execution</small>
              </div>
              {bookingError && <div className="reservation-console__error">{bookingError}</div>}
              {!isPosted && <button className="reservation-console__confirm" type="submit" disabled={isSubmitting}><CheckCircle size={14} /> {isSubmitting ? 'Saving Reservation…' : 'Confirm & Save Reservation'}</button>}
              {!isPosted && viewMode === 'create' && <button className="reservation-console__hold" type="button" disabled={isSubmitting} onClick={handlePendingSubmit}><Clock size={13} /> {isSubmitting ? 'Saving…' : 'Save as Tentative Hold'}</button>}
              <div className="reservation-console__utility-actions">
                <button className="reservation-console__receipt" type="button" onClick={() => editingId ? navigate(`/print/${editingId}`) : toast.error('Save reservation first to generate a receipt')}><Download size={12} /> Receipt &amp; PDF</button>
                <button type="button" onClick={handleDiscardForm}>Discard Booking</button>
              </div>
              <button className="reservation-console__sop" type="button" aria-expanded={sopOpen} onClick={() => setSopOpen((open) => !open)}><HelpCircle size={12} /> Manager SOPs &amp; Policy Notes <ChevronDown className={sopOpen ? 'is-open' : ''} size={12} /></button>
              {sopOpen && (
                <div className="reservation-console__sop-content">
                  <p>• Verified CNIC copy must be stored within 48 hours of the initial hold.</p>
                  <p>• Overtime is billed at PKR {Number(overtimeRate).toLocaleString()} per hour.</p>
                  <p>• Confirm cancellation and advance policy with the client before saving.</p>
                </div>
              )}
              <div className="reservation-console__staff"><span>●</span><div><b>Catering Staff Assigned</b><small>Team allocation after confirmation</small></div><button type="button" onClick={() => navigate('/settings?tab=staff')}>Manage</button></div>
              <button className="reservation-console__back" type="button" onClick={handleDiscardForm}>Back to reservations</button>
            </aside>
          </form>
        )}

        {/* Legacy form retained only as implementation reference */}
        {false && (viewMode === 'create' || viewMode === 'edit') && (
          <form onSubmit={handleSubmit} className="hall-reservation-form">
            {/* Header section with back nav */}
            <div className="reservation-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '24px', marginBottom: '40px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button type="button" onClick={() => setViewMode('list')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }} className="hover:bg-slate-100">
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>Fill in the details to reserve a hall slot.</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {(() => {
                  const st = BOOKING_STATUS_STYLE[formData.booking_status] || BOOKING_STATUS_STYLE.PENDING;
                  return (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        backgroundColor: st.bg,
                        color: st.color,
                      }}
                    >
                      {st.label}
                    </span>
                  );
                })()}
                {isPosted && (
                  <p className="erp-doc-readonly">This booking is posted or cancelled and cannot be edited. Print or cancel/reverse from the list if needed.</p>
                )}
                <select
                  value={formData.booking_status}
                  onChange={(e) => setFormData({ ...formData, booking_status: e.target.value })}
                  aria-label="Booking status"
                  disabled={isPosted}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: 'var(--surface)',
                    color: 'var(--text-main)',
                  }}
                >
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            {bookingError && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px 20px', color: '#b91c1c', fontSize: '14px', fontWeight: '600', marginBottom: '32px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <X size={18} style={{ backgroundColor: '#b91c1c', color: 'white', borderRadius: '50%', padding: '2px' }} />
                {bookingError}
              </div>
            )}

            <div className="booking-layout reservation-workspace">
              {/* Form entries - Left hand side */}
              <div className="reservation-main" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                
                {/* section: Essentials */}
                <section className="reservation-section reservation-essentials" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.15em', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CalendarIcon size={14} />
                    Event & Client Details
                    <small>Step 1 of 3</small>
                  </h3>
                  <div className="premium-card form-grid-2 form-grid-2--gap-24 reservation-essentials-grid" style={{ padding: '28px' }}>
                    <div className="input-group">
                      <label>Booking ID</label>
                      <input type="text" readOnly value={formData.booking_id || 'BK-2026-AUTO'} style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-dim)', fontWeight: 'bold', fontFamily: 'monospace' }} />
                    </div>
                    <div className="input-group">
                      <label>Booking Date</label>
                      <input type="date" required disabled={isEdit} value={formData.booking_date} onChange={(e) => setFormData({ ...formData, booking_date: e.target.value })} style={isEdit ? { backgroundColor: 'var(--surface-elevated)', color: 'var(--text-dim)', cursor: 'not-allowed' } : {}} />
                    </div>
                    <div className="input-group">
                      <label>Event Date</label>
                      <input type="date" required disabled={isEdit} value={formData.event_date} onChange={(e) => setFormData({ ...formData, event_date: e.target.value })} style={isEdit ? { backgroundColor: 'var(--surface-elevated)', color: 'var(--text-dim)', cursor: 'not-allowed' } : {}} />
                    </div>
                    <div className="input-group">
                      <label>Event Title</label>
                      <input 
                        type="text" 
                        list="event-suggestions" 
                        required 
                        disabled={isEdit}
                        placeholder="e.g. Barat Ceremony, Walima Reception..." 
                        value={formData.event_name} 
                        onChange={(e) => setFormData({ ...formData, event_name: e.target.value })} 
                        style={isEdit ? { backgroundColor: 'var(--surface-elevated)', color: 'var(--text-dim)', cursor: 'not-allowed' } : {}}
                      />
                      <datalist id="event-suggestions">
                        {Array.from(new Set(bookings.map(b => b.event_name).filter(Boolean))).map(name => (
                          <option key={name} value={name} />
                        ))}
                        <option value="Barat Ceremony" />
                        <option value="Walima Reception" />
                        <option value="Mehndi Night" />
                        <option value="Mayon Ceremony" />
                        <option value="Shendi Ceremony" />
                        <option value="Engagement Ceremony" />
                        <option value="Birthday Celebration" />
                        <option value="Corporate Seminar" />
                        <option value="Get Together Party" />
                      </datalist>
                    </div>
                  </div>
                </section>

                {/* section: Client Info */}
                <section className="reservation-section reservation-client" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.15em', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '4px', height: '16px', backgroundColor: 'var(--primary)', borderRadius: '2px' }}></span>
                      Registered Client
                    </h3>
                    
                    {/* Selector toggle */}
                    {!isEdit && (
                      <div style={{ display: 'flex', backgroundColor: 'var(--toggle-track)', borderRadius: '8px', padding: '2px' }}>
                        <button type="button" onClick={() => { setNewCustomerMode(false); setScannedClient(null); }} style={{ fontSize: '11px', fontWeight: '700', padding: '6px 12px', borderRadius: '6px', backgroundColor: !newCustomerMode ? 'var(--surface)' : 'transparent', color: !newCustomerMode ? 'var(--secondary)' : 'var(--text-dim)', boxShadow: !newCustomerMode ? 'var(--shadow-sm)' : 'none' }}>
                          Select Client
                        </button>
                        <button type="button" onClick={() => { setNewCustomerMode(true); setScannedClient(null); }} style={{ fontSize: '11px', fontWeight: '700', padding: '6px 12px', borderRadius: '6px', backgroundColor: newCustomerMode ? 'var(--surface)' : 'transparent', color: newCustomerMode ? 'var(--secondary)' : 'var(--text-dim)', boxShadow: newCustomerMode ? 'var(--shadow-sm)' : 'none' }}>
                          + Add Client
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="premium-card reservation-client-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '28px' }}>
                    {!newCustomerMode ? (
                      <div className="input-group">
                        <label>Existing Client / Customer</label>
                        <select
                          required={!newCustomerMode}
                          disabled={isEdit}
                          value={formData.customer}
                          onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                          style={isEdit ? { backgroundColor: 'var(--surface-elevated)', color: 'var(--text-dim)', cursor: 'not-allowed' } : {}}
                        >
                          <option value="">Select Customer</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {customerDisplayName(c)} ({c.phone})
                            </option>
                          ))}
                        </select>
                        {formData.customer && (
                          <Link
                            to={`/customers/${formData.customer}`}
                            style={{ marginTop: '8px', fontSize: '12px', fontWeight: '600', color: 'var(--primary)', display: 'inline-block' }}
                          >
                            View customer profile →
                          </Link>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <CnicScannerPanel
                          onScan={handleIdScan}
                          disabled={scanProcessing || savingScannedClient}
                        />
                        {scannedClient ? (
                          <ScannedGuestPanel
                            draft={scannedClient}
                            loading={scanProcessing}
                            saving={savingScannedClient}
                            onChange={handleScannedClientChange}
                            onPhoneChange={handleScannedClientPhoneChange}
                            onSave={() => saveClientFromScan(scannedClient)}
                            onCancel={() => setScannedClient(null)}
                          />
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="input-group">
                              <label>Full Name</label>
                              <input type="text" required placeholder="e.g. Muhammad Ali Khan" value={newCustomer.full_name} onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })} />
                            </div>
                            <div className="input-group">
                              <label>CNIC</label>
                              <input type="text" placeholder="e.g. 35202-1234567-9" value={newCustomer.cnic} onChange={(e) => setNewCustomer({ ...newCustomer, cnic: e.target.value })} style={{ fontFamily: 'monospace' }} />
                            </div>
                            <div className="input-group">
                              <label>Phone Number</label>
                              <input type="tel" required placeholder="+92 300 0000000" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                            </div>
                            <div className="input-group">
                              <label>Email Address <span style={{ fontWeight: '400', color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input type="email" placeholder="example@gmail.com" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
                            </div>
                            <div className="input-group" style={{ gridColumn: 'span 2' }}>
                              <label>Residential Address</label>
                              <textarea rows="2" placeholder="Street address, City, Province" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} style={{ resize: 'none' }}></textarea>
                            </div>
                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                              <button
                                type="button"
                                onClick={handleSaveNewCustomerInline}
                                style={{
                                  backgroundColor: 'var(--primary)',
                                  color: 'white',
                                  padding: '10px 20px',
                                  borderRadius: '8px',
                                  fontSize: '13px',
                                  fontWeight: '700',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: 'var(--shadow-sm)',
                                  transition: 'opacity 0.2s',
                                }}
                                className="hover:opacity-90"
                              >
                                <Plus size={16} /> Save & Select Client
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {/* section: Venue & Logistics */}
                <section className="reservation-section reservation-venue" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.15em', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '4px', height: '16px', backgroundColor: 'var(--primary)', borderRadius: '2px' }}></span>
                    Select Banquet Hall
                  </h3>
                  <div className="premium-card form-grid-2 form-grid-2--gap-24 reservation-venue-grid" style={{ padding: '28px' }}>
                    
                    {/* Venue & Slot Segmented control */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div className="input-group">
                        <label>Select Venue Hall</label>
                        {!formData.venue && !isEdit && (
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>No hall selected - tap a hall below</p>
                        )}
                        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--toggle-track)', borderRadius: '8px', padding: '3px', flexWrap: 'wrap' }}>
                          {halls.length === 0 && (
                            <span style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '8px 12px' }}>No halls available. Add a hall first.</span>
                          )}
                          {hallsForSelect.map(h => {
                            const isSel = formData.venue !== '' && String(formData.venue) === String(h.id);
                            return (
                              <button
                                key={h.id}
                                type="button"
                                disabled={isEdit}
                                onClick={() => {
                                  if (isSel) {
                                    setFormData({ ...formData, venue: '', rate_per_head: 1200 });
                                  } else {
                                    setFormData({ ...formData, venue: h.id, rate_per_head: h.price_per_head || 1200 });
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  backgroundColor: isSel ? 'white' : 'transparent',
                                  color: isSel ? 'var(--primary)' : 'var(--text-dim)',
                                  boxShadow: isSel ? 'var(--shadow-sm)' : 'none',
                                  cursor: isEdit ? 'not-allowed' : 'pointer'
                                }}
                              >
                                {h.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="input-group">
                        <label>Select Slot</label>
                        {!formData.slot && !isEdit && (
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>No timing selected - choose Morning or Evening</p>
                        )}
                        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--toggle-track)', borderRadius: '8px', padding: '3px' }}>
                          {['morning', 'evening'].map(s => {
                            const isSel = formData.slot === s;
                            return (
                              <button
                                key={s}
                                type="button"
                                disabled={isEdit}
                                onClick={() => setFormData({ ...formData, slot: isSel ? '' : s })}
                                style={{
                                  flex: 1,
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  backgroundColor: isSel ? 'white' : 'transparent',
                                  color: isSel ? 'var(--primary)' : 'var(--text-dim)',
                                  boxShadow: isSel ? 'var(--shadow-sm)' : 'none',
                                  textTransform: 'capitalize',
                                  cursor: isEdit ? 'not-allowed' : 'pointer'
                                }}
                              >
                                {s}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Attendance aggregation box */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div className="form-grid-2">
                        <div className="input-group">
                          <label>Gents Guest</label>
                          <input type="number" min="0" placeholder="-" value={displayNumField(formData.gents_count)} onChange={(e) => setFormData({ ...formData, gents_count: toIntField(e.target.value) })} />
                        </div>
                        <div className="input-group">
                          <label>Ladies Guest</label>
                          <input type="number" min="0" placeholder="-" value={displayNumField(formData.ladies_count)} onChange={(e) => setFormData({ ...formData, ladies_count: toIntField(e.target.value) })} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: '#fcfcfd', border: '1px solid var(--border)', borderRadius: '12px', marginTop: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', tracking: '0.05em', color: 'var(--text-muted)' }}>Total Attendance</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '24px', fontWeight: '900', color: 'var(--primary)' }}>{totalAttendance}</span>
                          {(() => {
                            const sel = halls.find(h => String(h.id) === String(formData.venue));
                            return sel ? <p style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: '500' }}>(Max Limit: {sel.capacity})</p> : null;
                          })()}
                        </div>
                      </div>
                    </div>

                  </div>
                </section>

                {/* section: Special Services */}
                <section className="reservation-section reservation-services" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.15em', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '4px', height: '16px', backgroundColor: 'var(--primary)', borderRadius: '2px' }}></span>
                    Additional Services & Operational Add-ons
                  </h3>
                  <div className="premium-card reservation-services-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', padding: '28px' }}>
                    <div className="input-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Overtime Hours</label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" step="0.5" min="0" placeholder="-" value={displayNumField(formData.overtime_hours)} onChange={(e) => setFormData({ ...formData, overtime_hours: toFloatField(e.target.value) })} style={{ width: '100%', paddingRight: '40px' }} />
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: '700', color: 'var(--text-dim)' }}>HRS</span>
                      </div>
                    </div>

                    <div className="input-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kitchen Services (PKR)</label>
                      <input type="number" min="0" placeholder="-" value={displayNumField(formData.kitchen_charge)} onChange={(e) => setFormData({ ...formData, kitchen_charge: toFloatField(e.target.value) })} />
                    </div>

                    <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={12} /> Decoration package (optional)
                      </label>
                      <select
                        value={selectedDecorationId}
                        onChange={(e) => handleDecorationPackageSelect(e.target.value)}
                        style={{ width: '100%', marginBottom: '8px' }}
                      >
                        <option value="">- Custom amount only -</option>
                        {decorationPackages.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} ({pkg.tier}) - Rs {Number(pkg.base_price || 0).toLocaleString()}
                          </option>
                        ))}
                      </select>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Decorations charge (PKR)</label>
                      <input type="number" min="0" placeholder="-" value={displayNumField(formData.decoration_charge)} onChange={(e) => setFormData({ ...formData, decoration_charge: toFloatField(e.target.value) })} />
                    </div>

                    <div className="input-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Deg Cooking Count</label>
                      <input type="number" min="0" placeholder="-" value={displayNumField(formData.deg_count)} onChange={(e) => setFormData({ ...formData, deg_count: toIntField(e.target.value) })} />
                    </div>

                    <div className="input-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Generator Usage (PKR)</label>
                      <input type="number" min="0" placeholder="-" value={displayNumField(formData.generator_charge)} onChange={(e) => setFormData({ ...formData, generator_charge: toFloatField(e.target.value) })} />
                    </div>
                  </div>
                </section>

                <section className="reservation-section reservation-inventory" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Package size={14} /> Inventory for this event
                  </h3>
                  <div className="premium-card reservation-inventory-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {inventoryLines.map((line, idx) => (
                      <div key={line.id || `line-${idx}`} className="form-grid-2" style={{ alignItems: 'end' }}>
                        <div className="input-group">
                          <label style={{ fontSize: '11px' }}>Item</label>
                          <select
                            value={line.inventory_item}
                            onChange={(e) => {
                              const next = [...inventoryLines];
                              next[idx] = { ...next[idx], inventory_item: e.target.value };
                              setInventoryLines(next);
                            }}
                          >
                            <option value="">Select item</option>
                            {inventoryCatalog.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.quantity} {item.unit} available)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div className="input-group" style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px' }}>Qty used</label>
                            <input
                              type="number"
                              min="1"
                              value={line.quantity_used}
                              onChange={(e) => {
                                const next = [...inventoryLines];
                                next[idx] = { ...next[idx], quantity_used: e.target.value };
                                setInventoryLines(next);
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setInventoryLines(inventoryLines.filter((_, i) => i !== idx))}
                            style={{ alignSelf: 'flex-end', padding: '10px', background: 'transparent', color: '#b91c1c' }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setInventoryLines([...inventoryLines, { inventory_item: '', quantity_used: 1 }])}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      + Add inventory item
                    </button>
                  </div>
                </section>

              </div>

              {/* Invoicing summary sidebar - Right hand side */}
              <div className="reservation-summary-column" style={{ position: 'sticky', top: '100px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="premium-card reservation-summary-card" style={{ padding: 0, overflow: 'hidden', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  
                  {/* Frosted header */}
                  <div className="reservation-summary-header" style={{ backgroundColor: 'rgba(255,107,44,0.05)', padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={18} color="var(--primary)" />
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', tracking: '0.05em' }}>Booking Summary</h3>
                      <p>REF: {formData.booking_id || 'NEW-RESERVATION'}</p>
                    </div>
                    <span className="reservation-live-dot">● Live</span>
                  </div>

                  {/* Pricing grid */}
                  <div className="reservation-summary-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="reservation-summary-line">
                      <span>Guaranteed Guests</span>
                      <strong>{totalAttendance || 0} PAX</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)' }}>Rate per Head</span>
                      <div style={{ position: 'relative', width: '110px' }}>
                        <input type="number" min="0" disabled={isEdit} value={displayNumField(formData.rate_per_head)} onChange={(e) => setFormData({ ...formData, rate_per_head: toFloatField(e.target.value) })} style={isEdit ? { width: '100%', textAlign: 'right', fontSize: '13px', padding: '4px 8px', fontWeight: '700', backgroundColor: 'var(--surface-elevated)', color: 'var(--text-dim)', cursor: 'not-allowed' } : { width: '100%', textAlign: 'right', fontSize: '13px', padding: '4px 8px', fontWeight: '700' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)' }}>Subtotal</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--secondary)' }}>PKR {subtotal.toLocaleString()}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Extra Services</span>
                        <span style={{ fontWeight: '600' }}>PKR {extraServices.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Taxes ({(taxRate * 100).toFixed(1).replace(/\.0$/, '')}%)</span>
                        <span style={{ fontWeight: '600' }}>PKR {taxAmount.toLocaleString()}</span>
                      </div>
                    </div>

                    {isEdit && !isPosted && (
                      <div className="input-group" style={{ marginBottom: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>Booking status</label>
                        <select
                          value={formData.booking_status}
                          onChange={(e) => setFormData({ ...formData, booking_status: e.target.value })}
                          style={{ width: '100%' }}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="CONFIRMED">Confirmed</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </div>
                    )}

                    {/* Total billing block */}
                    <div style={{ backgroundColor: 'var(--background)', padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.05em', color: 'var(--text-muted)' }}>Grand Total</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--primary)', marginRight: '4px' }}>PKR</span>
                          <span style={{ fontSize: '22px', fontWeight: '900', color: 'var(--primary)', tracking: '-0.02em' }}>{grandTotal.toLocaleString()}</span>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>Advance Paid</span>
                        <input type="number" min="0" placeholder="-" disabled={isEdit} value={displayNumField(formData.advance_paid)} onChange={(e) => setFormData({ ...formData, advance_paid: toFloatField(e.target.value) })} style={isEdit ? { width: '100px', padding: '4px 8px', fontSize: '12px', textAlign: 'right', fontWeight: '700', backgroundColor: 'var(--surface-elevated)', color: 'var(--text-dim)', cursor: 'not-allowed' } : { width: '100px', padding: '4px 8px', fontSize: '12px', textAlign: 'right', fontWeight: '700' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px dashed var(--border)', paddingTop: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.05em', color: hasCollectDue(remainingBalance) ? 'var(--error)' : 'var(--text-dim)' }}>Due</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '18px', fontWeight: '900', color: hasCollectDue(remainingBalance) ? 'var(--error)' : 'var(--text-dim)', tracking: '-0.02em' }}>{formatCollectDuePKR(remainingBalance)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                      {!isPosted && (
                      <button type="submit" className="btn-primary reservation-confirm-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', borderRadius: '10px', fontWeight: '700', fontSize: '14px' }}>
                        <CheckCircle size={18} />
                        {formData.booking_status === 'CONFIRMED' ? 'Confirm & Save Reservation' : 'Save booking'}
                      </button>
                      )}
                      {!isPosted && viewMode === 'create' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '10px', fontWeight: '700', fontSize: '13px' }}
                          onClick={(e) => handleSubmit(e, 'PENDING')}
                        >
                          <Clock size={18} /> Save as Tentative Hold
                        </button>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <button 
                          type="button" 
                          onClick={() => {
                            if (viewMode === 'edit' && editingId) {
                              navigate(`/print/${editingId}`);
                            } else {
                              toast.error('Please save the booking first to print receipts & reports!');
                            }
                          }} 
                          className="btn-secondary" 
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}
                        >
                          <Printer size={15} /> Receipts & Reports
                        </button>
                        <button type="button" onClick={() => setViewMode('list')} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', border: '1px solid #fee2e2', color: '#b91c1c' }}>
                          <X size={15} /> Cancel
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Manager's note display */}
                <div style={{ backgroundColor: 'rgba(255,107,44,0.03)', border: '1px solid rgba(255,107,44,0.1)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', tracking: '0.1em', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HelpCircle size={14} /> Manager's Note
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6', fontWeight: '500' }}>
                    Ensure all client identification documents (CNIC copy, mobile registration) are uploaded within 48 hours of advance payment. Overtime is charged at <span style={{ fontWeight: '700' }}>PKR {Number(overtimeRate).toLocaleString()}/hr</span>. Tax is {(taxRate * 100).toFixed(1).replace(/\.0$/, '')}%.
                  </p>
                </div>

              </div>

            </div>
          </form>
        )}

      <CancelBookingModal
        booking={cancelTarget}
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={fetchData}
      />
    </div>
  );
};

export default Bookings;
