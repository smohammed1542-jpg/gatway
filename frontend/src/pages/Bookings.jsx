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
  UserPlus
} from 'lucide-react';
import client from '../api/client';
import { formatCollectDue, formatCollectDuePKR, bookingCollectDue, hasCollectDue } from '../utils/currency';
import toast from 'react-hot-toast';
import { customerDisplayName, buildCustomerPayload } from '../utils/customer';
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
import { validatePakPhone } from '../utils/phone';
import { formatCnic } from '../utils/cnicScanner';
import './booking-reservation.css';

const BOOKING_STATUS_STYLE = {
  PENDING: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
  CONFIRMED: { bg: '#dcfce7', color: '#166534', label: 'Confirmed' },
  COMPLETED: { bg: '#dbeafe', color: '#1e40af', label: 'Completed' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled' },
};

const DEFAULT_EVENT_OPTIONS = [
  'Barat Ceremony',
  'Walima Reception',
  'Mehndi Night',
  'Mayon Ceremony',
  'Shendi Ceremony',
  'Engagement Ceremony',
  'Birthday Celebration',
  'Corporate Seminar',
  'Get Together Party',
];

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

const createBookingRefId = () => {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `BK-${year}-${randomNum}`;
};

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
  const [showManualInventory, setShowManualInventory] = useState(false);
  const [savingManualInventory, setSavingManualInventory] = useState(false);
  const [manualInventory, setManualInventory] = useState({
    name: '',
    price_per_unit: '',
    booking_quantity: '1',
    isNew: false,
  });
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
    booking_id: createBookingRefId(),
    event_name: '',
    customer: '',
    venue: '',
    booking_date: new Date().toISOString().split('T')[0],
    event_date: '',
    slot: '',
    custom_start_time: '',
    custom_end_time: '',
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
    address: ''
  });
  const [newCustomerErrors, setNewCustomerErrors] = useState({});

  const [bookingError, setBookingError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanProcessing, setScanProcessing] = useState(false);
  const [scannedClient, setScannedClient] = useState(null);
  const [savingScannedClient, setSavingScannedClient] = useState(false);
  const savingClientRef = useRef(false);
  const eventPickerRef = useRef(null);
  const [eventOptionsOpen, setEventOptionsOpen] = useState(false);
  const [taxRate, setTaxRate] = useState(0.05);
  const [overtimeRate, setOvertimeRate] = useState(5000);
  const [summaryVisibility, setSummaryVisibility] = useState({
    guests: true,
    ratePerHead: true,
    foodVenue: true,
    combinedServices: true,
    tax: true,
  });

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
        setSummaryVisibility({
          guests: tenant?.show_summary_guests !== false,
          ratePerHead: tenant?.show_summary_rate_per_head !== false,
          foodVenue: tenant?.show_summary_food_venue !== false,
          combinedServices: tenant?.show_summary_combined_services !== false,
          tax: tenant?.show_summary_tax !== false,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const closeEventOptions = (event) => {
      if (!eventPickerRef.current?.contains(event.target)) {
        setEventOptionsOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeEventOptions);
    return () => document.removeEventListener('pointerdown', closeEventOptions);
  }, []);

  // Recalculate calculations in real-time
  const totalAttendance = Number(formData.gents_count || 0) + Number(formData.ladies_count || 0);
  const subtotal = totalAttendance * Number(formData.rate_per_head || 0);
  
  // Overtime rate: 5000 PKR per hour
  const extraServices = (Number(formData.overtime_hours || 0) * overtimeRate) + 
                        Number(formData.kitchen_charge || 0) + 
                        Number(formData.decoration_charge || 0) + 
                        Number(formData.generator_charge || 0);
  const inventorySummaryLines = inventoryLines
    .map((line) => {
      if (!line.inventory_item || !line.include_in_bill) return null;
      const item = inventoryCatalog.find((candidate) => String(candidate.id) === String(line.inventory_item));
      if (!item) return null;
      const quantity = Number(line.quantity_used || 0);
      const unitPrice = Number(item.price_per_unit || 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        key: line.id || line.inventory_item,
        name: item.name,
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    })
    .filter(Boolean);
  const inventoryTotal = inventorySummaryLines.reduce((sum, line) => sum + line.total, 0);
                        
  const totalBeforeTax = subtotal + extraServices + inventoryTotal;
  const taxAmount = totalBeforeTax * taxRate;
  const grandTotal = totalBeforeTax + taxAmount;
  const remainingBalance = grandTotal - Number(formData.advance_paid || 0);
  const isPosted = isPostedBooking(formData.booking_status);

  const resetForm = () => {
    setFormData({
      booking_id: createBookingRefId(),
      event_name: '',
      customer: '',
      venue: '',
      booking_date: new Date().toISOString().split('T')[0],
      event_date: '',
      slot: '',
      custom_start_time: '',
      custom_end_time: '',
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
      address: ''
    });
    setNewCustomerMode(false);
    setNewCustomerErrors({});
    setBookingError('');
    setEditingId(null);
    setSelectedDecorationId('');
    setInventoryLines([]);
    setShowManualInventory(false);
    setSavingManualInventory(false);
    setManualInventory({
      name: '',
      price_per_unit: '',
      booking_quantity: '1',
    });
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
          original_quantity: r.quantity_used,
          include_in_bill: Boolean(r.include_in_bill),
        }))
      );
    } catch {
      setInventoryLines([]);
    }
  };

  const syncBookingInventory = async (bookingId) => {
    const res = await client.get(`/inventory/booking-items/?booking=${bookingId}`);
    const existing = res.data.results || res.data || [];
    const retainedIds = new Set(
      inventoryLines.filter((line) => line.id).map((line) => Number(line.id))
    );
    for (const line of inventoryLines.filter((candidate) => candidate.id)) {
      const qty = parseInt(line.quantity_used, 10);
      if (!qty || qty <= 0) continue;
      await client.patch(`/inventory/booking-items/${line.id}/`, {
        quantity_used: qty,
        include_in_bill: Boolean(line.include_in_bill),
      });
    }
    await Promise.all(
      existing
        .filter((allocation) => !retainedIds.has(Number(allocation.id)))
        .map((allocation) => client.delete(`/inventory/booking-items/${allocation.id}/`))
    );
    for (const line of inventoryLines.filter((candidate) => !candidate.id)) {
      const itemId = parseInt(line.inventory_item, 10);
      const qty = parseInt(line.quantity_used, 10);
      if (!itemId || !qty || qty <= 0) continue;
      await client.post('/inventory/booking-items/', {
        booking: bookingId,
        inventory_item: itemId,
        quantity_used: qty,
        include_in_bill: Boolean(line.include_in_bill),
      });
    }
  };

  const hallsForSelect = halls.filter(
    (h) => h.status !== 'INACTIVE' || String(h.id) === String(formData.venue)
  );
  const availableInventoryCatalog = inventoryCatalog.filter((item) => item.status !== 'INACTIVE');

  const handleCreateManualInventory = async (event) => {
    event.preventDefault();
    if (!canManage || savingManualInventory) return;

    const name = manualInventory.name.trim();
    const bookingQuantity = Number(manualInventory.booking_quantity);
    const stockQuantity = bookingQuantity;
    const unit = 'units';
    const pricePerUnit = Number(manualInventory.price_per_unit || 0);

    if (!name) {
      toast.error('Item name is required.');
      return;
    }
    if (!Number.isInteger(bookingQuantity) || bookingQuantity <= 0) {
      toast.error('Quantity must be a whole number greater than zero.');
      return;
    }
    if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
      toast.error('Unit price cannot be negative.');
      return;
    }

    const duplicate = inventoryCatalog.find(
      (item) => item.name?.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      const alreadyAdded = inventoryLines.some(
        (line) => String(line.inventory_item) === String(duplicate.id)
      );
      if (!alreadyAdded && Number(duplicate.quantity || 0) > 0) {
        setInventoryLines((current) => [
          ...current,
          {
            inventory_item: String(duplicate.id),
            quantity_used: Math.min(bookingQuantity, Number(duplicate.quantity)),
            include_in_bill: false,
          },
        ]);
        setShowManualInventory(false);
        toast(`"${duplicate.name}" already exists and was selected. Update its stock from Inventory.`);
      } else {
        toast.error(`"${duplicate.name}" already exists in Inventory.`);
      }
      return;
    }

    setSavingManualInventory(true);
    try {
      const response = await client.post('/inventory/items/', {
        name,
        category: 'OTHER',
        quantity: stockQuantity,
        unit,
        price_per_unit: pricePerUnit,
        status: stockQuantity <= 5 ? 'LOW_STOCK' : 'IN_STOCK',
        last_restocked: new Date().toISOString().split('T')[0],
        description: 'Created from booking reservation',
      });
      const createdItem = response.data;
      setInventoryCatalog((current) => [...current, createdItem]);
      setInventoryLines((current) => [
        ...current,
        {
          inventory_item: String(createdItem.id),
          quantity_used: bookingQuantity,
          include_in_bill: false,
        },
      ]);
      setManualInventory({
        name: '',
        price_per_unit: '',
        booking_quantity: '1',
        isNew: false,
      });
      setShowManualInventory(false);
      toast.success(`${createdItem.name} added to Inventory and this booking.`);
    } catch (error) {
      const data = error.response?.data;
      const message = data?.name?.[0]
        || data?.quantity?.[0]
        || data?.price_per_unit?.[0]
        || data?.detail
        || 'Failed to create inventory item.';
      toast.error(message);
    } finally {
      setSavingManualInventory(false);
    }
  };

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
      booking_id: booking.booking_id || `BK-${booking.id}`,
      event_name: booking.event_name,
      customer: booking.customer,
      venue: booking.venue,
      booking_date: booking.booking_date || new Date().toISOString().split('T')[0],
      event_date: booking.event_date || (booking.start_date ? booking.start_date.split('T')[0] : ''),
      slot: booking.slot || '',
      custom_start_time: booking.custom_start_time || '',
      custom_end_time: booking.custom_end_time || '',
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

  const validateNewCustomerFields = () => {
    const errors = {};
    if (!newCustomer.full_name?.trim()) errors.full_name = 'Full name is required.';
    const phoneError = validatePakPhone(newCustomer.phone);
    if (phoneError) errors.phone = phoneError;
    setNewCustomerErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateNewCustomerField = (field, value) => {
    setNewCustomer((current) => ({ ...current, [field]: value }));
    setNewCustomerErrors((current) => ({ ...current, [field]: '' }));
  };

  const handleSaveNewCustomerInline = async () => {
    setBookingError('');
    if (!validateNewCustomerFields()) {
      setBookingError('Please complete the highlighted client fields.');
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
        address: ''
      });
      setNewCustomerErrors({});
      
      toast.success(`Client saved and selected: ${customerDisplayName(savedCust)}`);
    } catch (err) {
      const errData = err.response?.data;
      const msg = errData?.non_field_errors?.[0]
        || (typeof Object.values(errData || {})?.[0] === 'object' ? Object.values(errData)?.[0]?.[0] : Object.values(errData)?.[0])
        || 'Failed to save new client details.';
      setBookingError(msg);
      toast.error(msg);
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

    const selectedInventoryIds = new Set();
    for (const line of inventoryLines) {
      const item = availableInventoryCatalog.find(
        (candidate) => String(candidate.id) === String(line.inventory_item)
      );
      const quantity = Number(line.quantity_used);
      if (!item) {
        setBookingError('Please select a valid inventory item.');
        toast.error('Invalid inventory item');
        return;
      }
      if (selectedInventoryIds.has(String(item.id))) {
        setBookingError(`${item.name} is added more than once.`);
        toast.error('Duplicate inventory item');
        return;
      }
      selectedInventoryIds.add(String(item.id));
      if (!Number.isInteger(quantity) || quantity < 1) {
        setBookingError(`Enter a valid quantity for ${item.name}.`);
        toast.error('Invalid inventory quantity');
        return;
      }
      const available = Number(item.quantity || 0) + Number(line.original_quantity || 0);
      if (quantity > available) {
        setBookingError(`Only ${available} ${item.unit || 'units'} of ${item.name} are available.`);
        toast.error('Inventory quantity exceeds stock');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let finalCustomerId = formData.customer;

      // 1. If "Create New Customer" is active, call customer API first
      if (newCustomerMode) {
        if (!validateNewCustomerFields()) {
          setBookingError('Please complete the highlighted client fields.');
          toast.error('Required client fields missing');
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
        setBookingError('Please select a timing slot.');
        toast.error('Timing required');
        return;
      }

      if (formData.slot === 'custom' && (!formData.custom_start_time || !formData.custom_end_time)) {
        setBookingError('Please enter both start and end time for the custom slot.');
        toast.error('Custom start and end time required');
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
        custom_start_time: formData.slot === 'custom' ? formData.custom_start_time : null,
        custom_end_time: formData.slot === 'custom' ? formData.custom_end_time : null,
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
      toast.error(msg);
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
  const selectedCustomerPhone = selectedCustomer?.phone || 'Not available';
  const selectedCustomerCnic = selectedCustomer?.cnic || formData.cnic;
  const selectedCustomerCnicDisplay = selectedCustomerCnic
    ? formatCnic(selectedCustomerCnic)
    : 'CNIC';
  const manualInventoryExistingItem = !manualInventory.isNew
    ? inventoryCatalog.find(
      (item) => item.name?.trim().toLowerCase() === manualInventory.name.trim().toLowerCase()
    )
    : null;
  const manualInventorySelectValue = manualInventoryExistingItem
    ? String(manualInventoryExistingItem.id)
    : (manualInventory.isNew ? '__new__' : '');
  const isClientKycVerified = Boolean(selectedCustomer?.cnic || (newCustomerMode && newCustomer.cnic));
  const stepOneMissing = [
    !formData.booking_date && 'booking date',
    !formData.event_date && 'event date',
    !formData.event_name?.trim() && 'event title',
    !(newCustomerMode
      ? newCustomer.full_name?.trim() && newCustomer.phone?.trim()
      : formData.customer) && 'client',
  ].filter(Boolean);
  const stepTwoMissing = [
    !formData.venue && 'hall',
    !formData.slot && 'time slot',
    formData.slot === 'custom' && (!formData.custom_start_time || !formData.custom_end_time) && 'custom start/end time',
    totalAttendance <= 0 && 'guest count',
    selectedHall && totalAttendance > selectedHall.capacity && 'reduce guests to hall capacity',
  ].filter(Boolean);
  const reservationStep = stepOneMissing.length ? 1 : stepTwoMissing.length ? 2 : 3;
  const reservationCompletedSteps = reservationStep - 1;
  const reservationStepMissing = reservationStep === 1 ? stepOneMissing : stepTwoMissing;
  const reservationStepText = reservationStep === 3
    ? 'Step 3/3 · Review & Save'
    : `Step ${reservationStep}/3 · ${reservationStepMissing[0]}${reservationStepMissing.length > 1 ? ` +${reservationStepMissing.length - 1}` : ''} left`;
  const reservationStepDetails = reservationStep === 3
    ? 'Event, client, hall, slot and attendance are complete. Review billing and save.'
    : `${reservationCompletedSteps} of 3 steps complete. Remaining: ${reservationStepMissing.join(', ')}.`;
  const eventOptions = Array.from(new Set([
    ...DEFAULT_EVENT_OPTIONS,
    ...bookings.map((booking) => booking.event_name).filter(Boolean),
  ]));
  const filteredEventOptions = eventOptions.filter((name) => (
    name.toLowerCase().includes(formData.event_name.trim().toLowerCase())
  ));
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
                  <h2>
                    <CalendarIcon size={13} />
                    Event &amp; Client Details
                    <span
                      className={`reservation-console__step-badge reservation-console__step-badge--${reservationStep}`}
                      title={reservationStepDetails}
                      aria-live="polite"
                    >
                      {reservationStepText}
                    </span>
                  </h2>
                  <div className={isClientKycVerified ? 'is-verified' : 'is-pending'}>
                    <ShieldCheck size={11} /> Client KYC {isClientKycVerified ? 'Verified' : 'Pending'}
                  </div>
                </div>

                <div className="reservation-console__event-grid">
                  <label>
                    <span>Booking Identifier</span>
                    <div className="reservation-console__auto-field">
                      <strong>{formData.booking_id || '—'}</strong>
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
                  <label className="reservation-console__event-picker" ref={eventPickerRef}>
                    <span>Event Title / Occasion</span>
                    <div className="reservation-console__event-input">
                      <input
                        type="text"
                        required
                        disabled={isEdit}
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={eventOptionsOpen}
                        aria-controls="reservation-event-options"
                        aria-autocomplete="list"
                        placeholder="Select or type an event"
                        value={formData.event_name}
                        onFocus={() => setEventOptionsOpen(true)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setEventOptionsOpen(false);
                          if (event.key === 'ArrowDown') setEventOptionsOpen(true);
                        }}
                        onChange={(event) => {
                          setFormData({ ...formData, event_name: event.target.value });
                          setEventOptionsOpen(true);
                        }}
                      />
                      <ChevronDown size={16} aria-hidden="true" />
                    </div>
                    {eventOptionsOpen && !isEdit && filteredEventOptions.length > 0 && (
                      <div className="reservation-console__event-options" id="reservation-event-options" role="listbox">
                        {filteredEventOptions.map((name) => (
                          <button
                            key={name}
                            type="button"
                            role="option"
                            aria-selected={formData.event_name === name}
                            onClick={() => {
                              setFormData({ ...formData, event_name: name });
                              setEventOptionsOpen(false);
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
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
                    <div className="reservation-console__readout">{selectedCustomerPhone}</div>
                  </label>
                  <label>
                    <span>CNIC Identity</span>
                    <div className="reservation-console__readout reservation-console__mono">{selectedCustomerCnicDisplay}</div>
                  </label>
                  {!isEdit && (
                    <button type="button" className="reservation-console__new-client" onClick={() => { setNewCustomerMode((current) => !current); setScannedClient(null); }}>
                      <UserPlus size={12} /> {newCustomerMode ? 'Select Client' : '+ New Client'}
                    </button>
                  )}
                </div>

                {newCustomerMode && !isEdit && (
                  <div className="reservation-console__new-client-panel">
                    <label className={`reservation-console__client-field${newCustomerErrors.full_name ? ' has-error' : ''}`}>
                      <span>Full name *</span>
                      <input type="text" required aria-invalid={Boolean(newCustomerErrors.full_name)} placeholder="Full name" value={newCustomer.full_name} onChange={(e) => updateNewCustomerField('full_name', e.target.value)} />
                      {newCustomerErrors.full_name && <small>{newCustomerErrors.full_name}</small>}
                    </label>
                    <label className={`reservation-console__client-field${newCustomerErrors.phone ? ' has-error' : ''}`}>
                      <span>Phone number *</span>
                      <input type="tel" required maxLength={13} aria-invalid={Boolean(newCustomerErrors.phone)} placeholder="0300 1234567" value={newCustomer.phone} onChange={(e) => updateNewCustomerField('phone', e.target.value)} />
                      {newCustomerErrors.phone && <small>{newCustomerErrors.phone}</small>}
                    </label>
                    <label className="reservation-console__client-field">
                      <span>CNIC</span>
                      <input type="text" placeholder="CNIC (optional)" value={newCustomer.cnic} onChange={(e) => updateNewCustomerField('cnic', e.target.value)} />
                    </label>
                    <label className="reservation-console__client-field">
                      <span>Email</span>
                      <input type="email" placeholder="Email (optional)" value={newCustomer.email} onChange={(e) => updateNewCustomerField('email', e.target.value)} />
                    </label>
                    <label className="reservation-console__client-field reservation-console__client-address">
                      <span>Address</span>
                      <input type="text" placeholder="Residential address (optional)" value={newCustomer.address} onChange={(e) => updateNewCustomerField('address', e.target.value)} />
                    </label>
                    <button type="button" onClick={handleSaveNewCustomerInline}>Save &amp; Select</button>
                  </div>
                )}
              </section>

              <section className="reservation-console__card reservation-console__venue">
                <div className="reservation-console__heading">
                  <h2>
                    <Building2 size={13} />
                    Venue Setup
                  </h2>
                </div>

                <div className="reservation-console__venue-body">
                  <div className="reservation-console__venue-selector">
                    <div className="reservation-console__section-label">
                      Select Hall
                      <span className="reservation-console__step-badge">
                        Capacity {selectedHall?.capacity || 0}
                      </span>
                    </div>
                    {hallsForSelect.length > 0 && hallsForSelect.length <= 2 ? (
                      <div className="reservation-console__hall-grid">
                        {hallsForSelect.map((hall) => {
                          const selected = String(formData.venue) === String(hall.id);
                          return (
                            <button
                              key={hall.id}
                              type="button"
                              disabled={isEdit}
                              className={selected ? 'is-selected' : ''}
                              onClick={() => setFormData({
                                ...formData,
                                venue: selected ? '' : hall.id,
                                rate_per_head: selected ? 1200 : (hall.price_per_head || 1200),
                              })}
                            >
                              <strong>{hall.name}</strong>
                              <span>{hall.capacity} pax</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : hallsForSelect.length > 2 ? (
                      <select
                        className="reservation-console__hall-select"
                        aria-label="Select banquet hall"
                        disabled={isEdit}
                        value={formData.venue}
                        onChange={(event) => {
                          const hall = hallsForSelect.find((item) => String(item.id) === event.target.value);
                          setFormData({
                            ...formData,
                            venue: event.target.value,
                            rate_per_head: hall?.price_per_head || 1200,
                          });
                        }}
                      >
                        <option value="">Select from {hallsForSelect.length} available halls</option>
                        {hallsForSelect.map((hall) => (
                          <option key={hall.id} value={hall.id}>
                            {hall.name} — {hall.capacity} pax
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="reservation-console__hall-empty">No active halls available</span>
                    )}
                  </div>

                  <div className="reservation-console__guests">
                    <div className="reservation-console__section-label"><Users size={12} /> Guests</div>
                    <div className="reservation-console__steppers">
                      <label>
                        <input
                          type="number"
                          min="0"
                          disabled={isPosted}
                          aria-label="Guest count"
                          placeholder="0"
                          value={
                            formData.gents_count === '' && formData.ladies_count === ''
                              ? ''
                              : totalAttendance
                          }
                          onChange={(event) => {
                            const guestCount = toIntField(event.target.value);
                            setFormData({
                              ...formData,
                              gents_count: guestCount,
                              ladies_count: guestCount === '' ? '' : 0,
                            });
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="reservation-console__slot">
                    <div className="reservation-console__section-label"><Timer size={12} /> Time Slot</div>
                    <div className="reservation-console__slot-options">
                      <button type="button" disabled={isEdit} className={formData.slot === 'morning' ? 'is-selected' : ''} onClick={() => setFormData({ ...formData, slot: formData.slot === 'morning' ? '' : 'morning', custom_start_time: '', custom_end_time: '' })}>
                        <span>Morning</span>
                        <small>9am – 3pm</small>
                      </button>
                      <button type="button" disabled={isEdit} className={formData.slot === 'evening' ? 'is-selected' : ''} onClick={() => setFormData({ ...formData, slot: formData.slot === 'evening' ? '' : 'evening', custom_start_time: '', custom_end_time: '' })}>
                        <span>Evening</span>
                        <small>6pm – 12am</small>
                      </button>
                      <button type="button" disabled={isEdit} className={formData.slot === 'custom' ? 'is-selected' : ''} onClick={() => setFormData({ ...formData, slot: formData.slot === 'custom' ? '' : 'custom', custom_start_time: '', custom_end_time: '' })}>
                        <span>Manual</span>
                        <small>Custom</small>
                      </button>
                    </div>
                    {formData.slot === 'custom' && (
                      <div className="reservation-console__manual-time">
                        <label>
                          <span>From</span>
                          <input type="time" required disabled={isEdit} value={formData.custom_start_time} onChange={(event) => setFormData({ ...formData, custom_start_time: event.target.value })} />
                        </label>
                        <label>
                          <span>To</span>
                          <input type="time" required disabled={isEdit} value={formData.custom_end_time} onChange={(event) => setFormData({ ...formData, custom_end_time: event.target.value })} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="reservation-console__card reservation-console__inventory">
                <div className="reservation-console__heading">
                  <h2>
                    <Package size={13} />
                    Catering, Decor &amp; Operational Add-ons
                    {inventoryLines.length > 0 && (
                      <span>{inventoryLines.length} item{inventoryLines.length === 1 ? '' : 's'}</span>
                    )}
                  </h2>
                </div>
                <div className="reservation-console__inventory-toolbar">
                  <small>Allocate stock items. Tick Bill to add that item’s unit price to the booking total.</small>
                  <div className="reservation-console__inventory-actions">
                    <button
                      type="button"
                      className="reservation-console__add-inventory"
                      disabled={availableInventoryCatalog.length === 0}
                      onClick={() => setInventoryLines([...inventoryLines, { inventory_item: '', quantity_used: 1, include_in_bill: false }])}
                    >
                      <Plus size={14} /> Add Item
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className="reservation-console__add-inventory reservation-console__add-inventory--manual"
                        onClick={() => setShowManualInventory((visible) => !visible)}
                      >
                        {showManualInventory ? 'Close New Item' : '+ Create New Item'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="reservation-console__inventory-lines">
                  {availableInventoryCatalog.length === 0 && inventoryLines.length === 0 && (
                    <div className="reservation-console__inventory-empty">
                      <Package size={18} />
                      <strong>No inventory stock yet</strong>
                      <span>Add items from Inventory, or create one here for this booking.</span>
                    </div>
                  )}
                  {availableInventoryCatalog.length > 0 && inventoryLines.length === 0 && (
                    <div className="reservation-console__inventory-empty">
                      <Package size={18} />
                      <strong>No add-ons selected</strong>
                      <span>Use Add Item to allocate chairs, decor, or catering stock.</span>
                    </div>
                  )}
                  {inventoryLines.map((line, index) => {
                    const item = availableInventoryCatalog.find((candidate) => String(candidate.id) === String(line.inventory_item));
                    const available = Number(item?.quantity || 0) + Number(line.original_quantity || 0);
                    const unitPrice = item ? Number(item.price_per_unit || 0) : 0;
                    const quantity = Number(line.quantity_used || 0);
                    const billAmount = line.include_in_bill && Number.isFinite(quantity) && quantity > 0
                      ? unitPrice * quantity
                      : 0;
                    const selectedByOtherLines = new Set(
                      inventoryLines
                        .filter((_, itemIndex) => itemIndex !== index)
                        .map((candidate) => String(candidate.inventory_item))
                    );
                    return (
                      <div
                        className="reservation-console__inventory-line"
                        key={line.id || index}
                      >
                        <label className="reservation-console__inventory-bill" title="Add item price to bill">
                          <input
                            type="checkbox"
                            checked={Boolean(line.include_in_bill)}
                            disabled={!item}
                            aria-label={`Add ${item?.name || 'item'} price to bill`}
                            onChange={(e) => {
                              const next = [...inventoryLines];
                              next[index] = { ...next[index], include_in_bill: e.target.checked };
                              setInventoryLines(next);
                            }}
                          />
                          <span>Bill</span>
                        </label>

                        <label className="reservation-console__inventory-field reservation-console__inventory-field--item">
                          <span>Item</span>
                          <select
                            disabled={Boolean(line.id)}
                            value={line.inventory_item}
                            onChange={(e) => {
                              const next = [...inventoryLines];
                              next[index] = {
                                ...next[index],
                                inventory_item: e.target.value,
                                quantity_used: 1,
                                include_in_bill: false,
                              };
                              setInventoryLines(next);
                            }}
                          >
                            <option value="">Select item</option>
                            {availableInventoryCatalog.map((candidate) => (
                              <option
                                key={candidate.id}
                                value={candidate.id}
                                disabled={selectedByOtherLines.has(String(candidate.id))}
                              >
                                {candidate.name} ({candidate.quantity} {candidate.unit})
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="reservation-console__inventory-field">
                          <span>Unit Price</span>
                          <div className="reservation-console__inventory-readout">
                            {item ? `PKR ${unitPrice.toLocaleString()}` : '—'}
                          </div>
                        </div>

                        <label className="reservation-console__inventory-field reservation-console__inventory-field--qty">
                          <span>Qty</span>
                          <input
                            type="number"
                            min="1"
                            max={available || undefined}
                            disabled={!item}
                            aria-label={`Quantity for ${item?.name || 'inventory item'}`}
                            value={line.quantity_used}
                            onChange={(e) => {
                              const next = [...inventoryLines];
                              next[index] = { ...next[index], quantity_used: e.target.value };
                              setInventoryLines(next);
                            }}
                          />
                        </label>

                        <div className="reservation-console__inventory-field reservation-console__inventory-field--amount">
                          <span>Bill Amount</span>
                          <div className="reservation-console__inventory-readout reservation-console__inventory-readout--amount">
                            {item && line.include_in_bill ? `PKR ${billAmount.toLocaleString()}` : '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="reservation-console__inventory-remove"
                          aria-label={`Remove ${item?.name || 'inventory item'}`}
                          onClick={() => setInventoryLines(inventoryLines.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                {showManualInventory && canManage && (
                  <div className="reservation-console__manual-inventory">
                    <div className="reservation-console__manual-inventory-head">
                      <div>
                        <strong>Create Inventory Item</strong>
                        <small>It will be saved to Inventory and selected for this booking.</small>
                      </div>
                      <button type="button" aria-label="Close manual inventory form" onClick={() => setShowManualInventory(false)}>×</button>
                    </div>
                    <div className="reservation-console__manual-inventory-grid">
                      <label>
                        <span>Item *</span>
                        <select
                          aria-label="Select inventory item"
                          value={manualInventorySelectValue}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === '__new__') {
                              setManualInventory({
                                ...manualInventory,
                                name: '',
                                price_per_unit: '',
                                isNew: true,
                              });
                              return;
                            }
                            if (!value) {
                              setManualInventory({
                                ...manualInventory,
                                name: '',
                                price_per_unit: '',
                                isNew: false,
                              });
                              return;
                            }
                            const existing = availableInventoryCatalog.find((item) => String(item.id) === value);
                            setManualInventory({
                              ...manualInventory,
                              name: existing?.name || '',
                              price_per_unit: existing ? String(existing.price_per_unit || 0) : '',
                              isNew: false,
                            });
                          }}
                        >
                          <option value="">Select item</option>
                          {availableInventoryCatalog.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} — {item.quantity} {item.unit}
                            </option>
                          ))}
                          <option value="__new__">+ Create new item</option>
                        </select>
                      </label>
                      {manualInventory.isNew && (
                        <label>
                          <span>New item name *</span>
                          <input
                            type="text"
                            placeholder="Enter item name"
                            value={manualInventory.name}
                            onChange={(event) => setManualInventory({ ...manualInventory, name: event.target.value })}
                          />
                        </label>
                      )}
                      <label>
                        <span>Price</span>
                        <input type="number" min="0" step="0.01" readOnly={Boolean(manualInventoryExistingItem)} placeholder="0.00" value={manualInventory.price_per_unit} onChange={(event) => setManualInventory({ ...manualInventory, price_per_unit: event.target.value })} />
                      </label>
                      <label>
                        <span>Quantity</span>
                        <input type="number" min="1" step="1" value={manualInventory.booking_quantity} onChange={(event) => setManualInventory({ ...manualInventory, booking_quantity: event.target.value })} />
                      </label>
                      <button type="button" disabled={savingManualInventory} onClick={handleCreateManualInventory}>
                        {savingManualInventory
                          ? 'Adding…'
                          : manualInventoryExistingItem
                            ? 'Add Existing to Booking'
                            : 'Add to Inventory & Booking'}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {galleryHalls.length > 0 && (
                <div className="reservation-console__gallery" aria-label="Available hall photos">
                  {galleryHalls.map((hall) => (
                  <figure key={hall.id} className={String(hall.id) === String(formData.venue) ? 'is-selected' : ''}>
                    <img src={resolveMediaUrl(hall.image)} alt={`${hall.name} hall`} />
                    <figcaption>
                      <strong>{hall.name}</strong>
                      <span>{hall.location || `${hall.capacity} pax capacity`}</span>
                    </figcaption>
                  </figure>
                  ))}
                </div>
              )}
            </div>

            <aside className="reservation-console__summary">
              <header>
                <div><h2>Booking Summary</h2><p>REF: {formData.booking_id || createBookingRefId()}</p></div>
                <span>● Live</span>
              </header>
              <div className="reservation-console__summary-lines">
                {summaryVisibility.guests && (
                  <div><span>Guaranteed Guests</span><b>{totalAttendance} PAX</b></div>
                )}
                {summaryVisibility.ratePerHead && (
                  <div><span>Rate / Head</span><label><input type="number" min="0" disabled={isEdit} value={displayNumField(formData.rate_per_head)} onChange={(e) => setFormData({ ...formData, rate_per_head: toFloatField(e.target.value) })} /></label></div>
                )}
                {summaryVisibility.foodVenue && (
                  <div><span>Food &amp; Venue</span><b>{subtotal.toLocaleString()}</b></div>
                )}
                {summaryVisibility.combinedServices && (
                  <div><span>Combined Services</span><b>{extraServices.toLocaleString()}</b></div>
                )}
                {inventorySummaryLines.map((line) => (
                  <div key={line.key} className="reservation-console__summary-inventory">
                    <span>{line.name}</span>
                    <b>{line.total.toLocaleString()}</b>
                  </div>
                ))}
                {summaryVisibility.tax && (
                  <div><span>Tax ({(taxRate * 100).toFixed(1).replace(/\.0$/, '')}% GST)</span><b>{taxAmount.toLocaleString()}</b></div>
                )}
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
              {!isPosted && <button className="reservation-console__confirm" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Confirm Booking'}</button>}
              {!isPosted && viewMode === 'create' && <button className="reservation-console__hold" type="button" disabled={isSubmitting} onClick={handlePendingSubmit}>{isSubmitting ? 'Saving…' : 'Save Draft'}</button>}
              <div className="reservation-console__utility-actions">
                <button className="reservation-console__receipt" type="button" onClick={() => editingId ? navigate(`/print/${editingId}`) : toast.error('Save reservation first to generate a receipt')}><Download size={12} /> Receipt &amp; PDF</button>
                <button type="button" onClick={handleDiscardForm}>Discard Booking</button>
              </div>
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
                      onClick={() => setInventoryLines([...inventoryLines, { inventory_item: '', quantity_used: 1, include_in_bill: false }])}
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
