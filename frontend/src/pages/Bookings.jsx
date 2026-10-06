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
import { resolveGuestFromIdScan, isPhoneCompleteForAutoSave, saveGuestFromDraft, findCustomerByCnic } from '../utils/idCardCustomer';
import DataTable from '../components/ui/DataTable';
import { getTenant } from '../api/core';
import { useHallPageVisibility } from '../context/HallPageVisibilityContext';
import { HALL_MODULE_KEYS } from '../constants/hallPages';
import { displayBookingId, nextEventBookingId } from '../utils/bookingId';
import { isPostedBooking, taxRateFromTenant, overtimeRateFromTenant } from '../utils/erp';
import { resolveMediaUrl } from '../utils/media';
import { validatePakPhone, formatPakPhone, PAK_PHONE_INPUT_MAX_LENGTH, PAK_PHONE_PLACEHOLDER } from '../utils/phone';
import { formatCnic, formatCnicInput, cnicDigits, validateCnic, CNIC_PLACEHOLDER, CNIC_INPUT_MAX_LENGTH } from '../utils/cnicScanner';
import {
  listHallServices,
  listBookingServices,
  createBookingService,
  updateBookingService,
  deleteBookingService,
} from '../api/hallServices';
import './booking-reservation.css';

const SERVICE_UNIT_SHORT = {
  PER_EVENT: '/ event',
  PER_GUEST: '/ guest',
  PER_HOUR: '/ hour',
};

const BOOKING_STATUS_STYLE = {
  DRAFT: { bg: '#e2e8f0', color: '#475569', label: 'Draft' },
  PENDING: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
  CONFIRMED: { bg: '#dcfce7', color: '#166534', label: 'Confirmed' },
  COMPLETED: { bg: '#dbeafe', color: '#1e40af', label: 'Completed' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled' },
};

/** Draft rows: explicit DRAFT, or legacy PENDING placeholders (live API may not accept DRAFT yet). */
const isDraftLikeBooking = (booking) => {
  if (!booking) return false;
  if (booking.booking_status === 'DRAFT') return true;
  if (booking.notes === '__draft__') return true;
  if (booking.booking_status !== 'PENDING') return false;
  return (
    !booking.customer
    || !booking.venue
    || !booking.event_date
    || booking.event_name === 'Draft'
  );
};

const resolveBookingStatusStyle = (booking) => {
  if (isDraftLikeBooking(booking)) return BOOKING_STATUS_STYLE.DRAFT;
  return BOOKING_STATUS_STYLE[booking.booking_status] || BOOKING_STATUS_STYLE.PENDING;
};

const HOLDING_STATUSES = new Set(['PENDING', 'CONFIRMED']);

const bookingEventDate = (booking) => {
  if (booking?.event_date) return String(booking.event_date).slice(0, 10);
  if (booking?.start_date) return String(booking.start_date).slice(0, 10);
  return '';
};

const bookingHoldsHall = (booking, excludeId) => {
  if (excludeId && String(booking.id) === String(excludeId)) return false;
  if (booking.booking_status === 'CANCELLED') return false;
  if (isDraftLikeBooking(booking)) return false;
  if (!HOLDING_STATUSES.has(booking.booking_status)) return false;
  return bookingVenueIds(booking).length > 0;
};

const bookingVenueIds = (booking) => {
  if (!booking) return [];
  if (Array.isArray(booking.venue_ids) && booking.venue_ids.length) {
    return [...new Set(booking.venue_ids.map(String))];
  }
  return booking.venue ? [String(booking.venue)] : [];
};

const formVenueIds = (form) => {
  if (Array.isArray(form?.venues) && form.venues.length) {
    return [...new Set(form.venues.map(String))];
  }
  return form?.venue ? [String(form.venue)] : [];
};

const withVenues = (form, ids) => {
  const venues = [...new Set((ids || []).map(String).filter(Boolean))];
  return { ...form, venues, venue: venues[0] || '' };
};

const bookingGuestCount = (booking) => {
  const gents = Number(booking?.gents_count || 0);
  const ladies = Number(booking?.ladies_count || 0);
  const named = gents + ladies;
  if (named > 0) return named;
  return Number(booking?.guest_count || 0);
};

const timeToMinutes = (value) => {
  if (!value) return null;
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(hours)) return null;
  return hours * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

const slotTimeWindow = (slot, customStart, customEnd) => {
  const key = String(slot || '').toLowerCase();
  if (key === 'morning') return { start: 9 * 60, end: 15 * 60 };
  if (key === 'evening') return { start: 18 * 60, end: 24 * 60 };
  if (key === 'custom') {
    const start = timeToMinutes(customStart);
    let end = timeToMinutes(customEnd);
    if (start == null || end == null) return null;
    if (end <= start) end += 24 * 60;
    return { start, end };
  }
  return null;
};

const bookingTimeWindow = (booking) => slotTimeWindow(
  booking?.slot,
  booking?.custom_start_time,
  booking?.custom_end_time,
);

const windowsOverlap = (left, right) => (
  left && right && left.start < right.end && right.start < left.end
);

const bookingOccupiesSelectedSlot = (booking, slot, customStart, customEnd) => {
  const selected = slotTimeWindow(slot, customStart, customEnd);
  const existing = bookingTimeWindow(booking);
  if (selected && existing) return windowsOverlap(selected, existing);
  return String(booking?.slot || '').toLowerCase() === String(slot || '').toLowerCase();
};

const availableSeatsOnDate = (hall, eventDate, bookings, excludeId, slot, customStart, customEnd) => {
  const capacity = Number(hall?.capacity || 0);
  if (!eventDate || !slot) return capacity;
  const occupied = bookings.reduce((sum, booking) => {
    if (!bookingHoldsHall(booking, excludeId)) return sum;
    if (!bookingVenueIds(booking).includes(String(hall.id))) return sum;
    if (bookingEventDate(booking) !== String(eventDate)) return sum;
    if (!bookingOccupiesSelectedSlot(booking, slot, customStart, customEnd)) return sum;
    return sum + bookingGuestCount(booking);
  }, 0);
  return Math.max(0, capacity - occupied);
};

const hallAvailableOnDate = (hall, eventDate, bookings, excludeId, slot, customStart, customEnd) => {
  if (!hall) return false;
  if (!eventDate || !slot) return Number(hall.capacity || 0) > 0;
  return availableSeatsOnDate(hall, eventDate, bookings, excludeId, slot, customStart, customEnd) > 0;
};

const isSlotReady = (form) => (
  Boolean(form?.slot)
  && (form.slot !== 'custom' || Boolean(form.custom_start_time && form.custom_end_time))
);

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

const createBookingRefId = (existing = [], fromDate) => nextEventBookingId(existing, fromDate);

/** Relative event-date label for the bookings list (no filter required). */
const getBookingDateWhen = (rawDate) => {
  const iso = String(rawDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const today = new Date();
  const todayIso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  if (iso === todayIso) {
    return { key: 'today', label: 'Today' };
  }
  const [y, m] = iso.split('-').map(Number);
  if (y === today.getFullYear() && m === today.getMonth() + 1) {
    return { key: 'month', label: 'This month' };
  }
  if (iso < todayIso) {
    return { key: 'past', label: 'Past' };
  }
  return { key: 'upcoming', label: 'Upcoming' };
};

const formatBookingDayHeading = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'No event date';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [serviceLines, setServiceLines] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const inventoryHydratedRef = useRef(true);
  const servicesHydratedRef = useRef(true);
  const lockedGrandTotalRef = useRef(null);
  const [grandTotalDraft, setGrandTotalDraft] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'create', 'edit', 'invoice'
  const [editingId, setEditingId] = useState(null);
  const isEdit = viewMode === 'edit';
  const isInvoice = viewMode === 'invoice';
  const isFormLocked = isEdit || isInvoice;
  usePageTitle(
    viewMode === 'create'
      ? 'Booking Request'
      : viewMode === 'edit'
        ? 'Modify Booking Details'
        : viewMode === 'invoice'
          ? 'Invoice'
          : null,
  );
  
  const [searchQuery, setSearchQuery] = useState('');
  const [eventDateFilter, setEventDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [invoiceCollectNow, setInvoiceCollectNow] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  
  // Primary Form Data
  const [formData, setFormData] = useState({
    booking_id: createBookingRefId(),
    event_name: '',
    customer: '',
    venue: '',
    venues: [],
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
  const [clientNameQuery, setClientNameQuery] = useState('');
  const [cnicLookupStatus, setCnicLookupStatus] = useState(''); // '', 'found', 'new'

  const [bookingError, setBookingError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanProcessing, setScanProcessing] = useState(false);
  const [scannedClient, setScannedClient] = useState(null);
  const [savingScannedClient, setSavingScannedClient] = useState(false);
  const savingClientRef = useRef(false);
  const eventPickerRef = useRef(null);
  const [eventOptionsOpen, setEventOptionsOpen] = useState(false);
  const [eventHighlightIndex, setEventHighlightIndex] = useState(0);
  const reservationFormRef = useRef(null);

  const focusReservationHall = () => {
    window.setTimeout(() => {
      const hallBtn = document.querySelector('.reservation-console__hall-grid button');
      const hallSelect = document.querySelector('.reservation-console__hall-select');
      (hallBtn || hallSelect)?.focus();
    }, 30);
  };
  const focusReservationSlot = () => {
    window.setTimeout(() => {
      document.querySelector('.reservation-console__slot-options button')?.focus();
    }, 30);
  };
  const focusReservationGuests = () => {
    window.setTimeout(() => {
      document.getElementById('reservation-guest-count')?.focus();
    }, 30);
  };
  const focusReservationInventory = () => {
    window.setTimeout(() => {
      const itemSelect = document.querySelector('.reservation-console__inventory-field--item select');
      const addBtn = document.getElementById('reservation-add-inventory');
      (itemSelect || addBtn)?.focus();
    }, 40);
  };
  const reservationStepOrder = [
    'booking-date',
    'event-date',
    'event-name',
    'cnic',
    'phone',
    'client-name',
    'address',
    'hall',
    'slot',
    'guests',
    'inventory',
    'advance',
    'confirm',
  ];
  const advanceReservationStep = (fromStep, filled = {}) => {
    const venueIds = filled.venues !== undefined ? filled.venues : formVenueIds(formData);
    const venue = filled.venue !== undefined ? filled.venue : (venueIds[0] || formData.venue);
    const slot = filled.slot !== undefined ? filled.slot : formData.slot;
    const eventName = filled.event_name !== undefined ? filled.event_name : formData.event_name;
    const customerId = filled.customer !== undefined ? filled.customer : formData.customer;
    const selected = customers.find((c) => String(c.id) === String(customerId));
    const cnicValue = newCustomerMode ? (newCustomer.cnic || formData.cnic) : (formData.cnic || selected?.cnic || '');
    const phoneValue = newCustomerMode ? (newCustomer.phone || '') : (selected?.phone || '');
    const clientName = newCustomerMode
      ? (newCustomer.full_name || clientNameQuery || '')
      : (selected ? customerDisplayName(selected) : (clientNameQuery || ''));
    const guests = Number(formData.gents_count || 0) + Number(formData.ladies_count || 0);

    let incomplete = '';
    if (fromStep === 'booking-date' && !formData.booking_date) incomplete = 'Booking date required';
    else if (fromStep === 'event-date' && !formData.event_date) incomplete = 'Event date required';
    else if (fromStep === 'event-name' && !String(eventName || '').trim()) incomplete = 'Event title required';
    else if (fromStep === 'cnic') {
      const cnicError = validateCnic(cnicValue, { required: true });
      if (cnicError) incomplete = cnicError;
    } else if (fromStep === 'phone') {
      const phoneError = validatePakPhone(phoneValue);
      if (phoneError) incomplete = phoneError;
    } else if (fromStep === 'client-name' && !customerId && !String(clientName || '').trim()) {
      incomplete = 'Select or enter client name';
    } else if (fromStep === 'hall' && !(formVenueIds({ venues: venueIds, venue }).length)) incomplete = 'Select a hall';
    else if (fromStep === 'slot') {
      if (!slot) incomplete = 'Select a time slot';
      else if (slot === 'custom' && (!formData.custom_start_time || !formData.custom_end_time)) {
        incomplete = 'Enter custom start and end time';
      }
    } else if (fromStep === 'guests' && guests <= 0) incomplete = 'Enter guest count';

    if (incomplete) {
      toast.error(incomplete, { id: 'reservation-step-incomplete' });
      return;
    }

    const form = reservationFormRef.current;
    const present = reservationStepOrder.filter((step) => {
      if (step === 'hall') {
        return Boolean(form?.querySelector('.reservation-console__hall-grid button, .reservation-console__hall-select'));
      }
      if (step === 'slot') {
        return Boolean(form?.querySelector('.reservation-console__slot-options button'));
      }
      if (step === 'inventory') {
        return Boolean(form?.querySelector('#reservation-add-inventory, .reservation-console__inventory-field--item select'));
      }
      return Boolean(form?.querySelector(`[data-rs-step="${step}"]`));
    });
    const index = present.indexOf(fromStep);
    const next = present[index + 1];
    if (!next) return;
    if (next === 'hall') {
      focusReservationHall();
      return;
    }
    if (next === 'slot') {
      focusReservationSlot();
      return;
    }
    if (next === 'inventory') {
      if (!document.querySelector('.reservation-console__inventory-field--item select')) {
        document.getElementById('reservation-add-inventory')?.click();
      }
      focusReservationInventory();
      return;
    }
    window.setTimeout(() => {
      form?.querySelector(`[data-rs-step="${next}"]`)?.focus();
    }, 20);
  };

  const [taxRate, setTaxRate] = useState(0.05);
  const [overtimeRate, setOvertimeRate] = useState(5000);
  const { isModuleVisible } = useHallPageVisibility();
  const summaryVisibility = {
    guests: isModuleVisible(HALL_MODULE_KEYS.SUMMARY_GUESTS),
    ratePerHead: isModuleVisible(HALL_MODULE_KEYS.SUMMARY_RATE_PER_HEAD),
    venue: isModuleVisible(HALL_MODULE_KEYS.SUMMARY_FOOD_VENUE),
    combinedServices: isModuleVisible(HALL_MODULE_KEYS.SUMMARY_COMBINED_SERVICES),
    tax: isModuleVisible(HALL_MODULE_KEYS.SUMMARY_TAX),
    inventory: isModuleVisible(HALL_MODULE_KEYS.SUMMARY_INVENTORY),
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [bookingsRes, hallsRes, customersRes, decoRes, invRes, servicesRes] = await Promise.all([
        client.get('/bookings/'),
        client.get('/venues/'),
        client.get('/customers/'),
        client.get('/decorations/packages/?is_active=true').catch(() => ({ data: [] })),
        client.get('/inventory/items/?page_size=1000').catch(() => ({ data: [] })),
        listHallServices().catch(() => []),
      ]);
      const asList = (payload) => {
        const data = payload?.results ?? payload;
        return Array.isArray(data) ? data : [];
      };
      setBookings(asList(bookingsRes.data));
      setHalls(asList(hallsRes.data));
      setInventoryCatalog(asList(invRes.data));
      setServiceCatalog(Array.isArray(servicesRes) ? servicesRes : []);
      setCustomers(asList(customersRes.data));
      setDecorationPackages(asList(decoRes.data).filter((p) => p.is_active !== false));
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
      const item = inventoryCatalog.find((candidate) => String(candidate.id) === String(line.inventory_item))
        || (line.item_name
          ? { name: line.item_name, price_per_unit: line.item_price ?? 0 }
          : null);
      if (!item) return null;
      const quantity = Number(line.quantity_used || 0);
      const unitPrice = Number(
        line.unit_price !== '' && line.unit_price != null
          ? line.unit_price
          : (item.price_per_unit ?? line.item_price ?? 0)
      );
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        key: `inv-${line.id || line.inventory_item}`,
        name: item.name,
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    })
    .filter(Boolean);
  const serviceSummaryLines = serviceLines
    .map((line) => {
      if (!line.service || !line.include_in_bill) return null;
      const svc = serviceCatalog.find((candidate) => String(candidate.id) === String(line.service))
        || (line.service_label
          ? { label: line.service_label, price: line.service_price ?? 0 }
          : null);
      if (!svc) return null;
      const quantity = Number(line.quantity || 0);
      const unitPrice = Number(
        line.unit_price !== '' && line.unit_price != null
          ? line.unit_price
          : (svc.price ?? line.service_price ?? 0)
      );
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        key: `svc-${line.id || line.service}`,
        name: svc.label,
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    })
    .filter(Boolean);
  const inventoryTotal = inventorySummaryLines.reduce((sum, line) => sum + line.total, 0);
  const hallServicesTotal = serviceSummaryLines.reduce((sum, line) => sum + line.total, 0);
  const addonSummaryLines = [...inventorySummaryLines, ...serviceSummaryLines];

  const totalBeforeTax = subtotal + extraServices + inventoryTotal + hallServicesTotal;
  const taxAmount = summaryVisibility.tax ? totalBeforeTax * taxRate : 0;
  const grandTotal = totalBeforeTax + taxAmount;
  const previousPaid = Number(formData.advance_paid || 0);
  const invoiceCollectAmount = isInvoice ? Number(invoiceCollectNow || 0) : 0;
  const remainingBeforeCollect = grandTotal - previousPaid;
  const remainingBalance = remainingBeforeCollect - invoiceCollectAmount;
  const isPosted = isPostedBooking(formData.booking_status);
  const addonExtrasTotal = extraServices + inventoryTotal + hallServicesTotal;
  const grandTotalTaxFactor = summaryVisibility.tax ? (1 + Number(taxRate || 0)) : 1;

  /** Typing a grand total sets rate/head = (total − add-ons) ÷ guests. */
  const applyGrandTotalAsPerHead = (rawValue, guestCount = totalAttendance, extras = addonExtrasTotal) => {
    const desired = toFloatField(rawValue);
    if (desired === '') {
      lockedGrandTotalRef.current = null;
      setGrandTotalDraft('');
      return;
    }
    const desiredNum = Math.max(0, Number(desired) || 0);
    lockedGrandTotalRef.current = desiredNum;
    setGrandTotalDraft(String(desired));
    const factor = summaryVisibility.tax ? (1 + Number(taxRate || 0)) : 1;
    if (guestCount > 0) {
      const subtotalNeeded = desiredNum / factor - extras;
      const rate = Math.max(0, subtotalNeeded / guestCount);
      setFormData((prev) => ({ ...prev, rate_per_head: Number(rate.toFixed(2)) }));
    }
  };

  const commitGrandTotalDraft = () => {
    if (grandTotalDraft == null) return;
    if (grandTotalDraft === '') {
      setGrandTotalDraft(null);
      return;
    }
    // Keep typed total visible until guests exist and rate can be applied.
    if (totalAttendance <= 0 && lockedGrandTotalRef.current != null) {
      setGrandTotalDraft(String(Math.round(lockedGrandTotalRef.current)));
      return;
    }
    setGrandTotalDraft(null);
  };

  useEffect(() => {
    if (isPosted || lockedGrandTotalRef.current == null) return;
    if (totalAttendance <= 0) return;
    if (grandTotalDraft != null) return; // don't fight while typing
    applyGrandTotalAsPerHead(lockedGrandTotalRef.current, totalAttendance, addonExtrasTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute rate when guests/add-ons change
  }, [totalAttendance, addonExtrasTotal, grandTotalTaxFactor, isPosted]);

  const resetForm = (overrides = {}) => {
    setFormData({
      booking_id: createBookingRefId(bookings),
      event_name: '',
      customer: '',
      venue: '',
      venues: [],
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
      booking_status: 'CONFIRMED',
      ...overrides,
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
    setClientNameQuery('');
    setCnicLookupStatus('');
    setBookingError('');
    setEditingId(null);
    setSelectedDecorationId('');
    setInventoryLines([]);
    setServiceLines([]);
    setInventoryLoading(false);
    inventoryHydratedRef.current = true;
    servicesHydratedRef.current = true;
    lockedGrandTotalRef.current = null;
    setGrandTotalDraft(null);
    setScannedClient(null);
    setScanProcessing(false);
    setSavingScannedClient(false);
    setInvoiceCollectNow('');
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
    setClientNameQuery(customerDisplayName(customer));
    setCnicLookupStatus(customer.cnic ? 'found' : '');
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
    if (scanProcessing || isFormLocked) return;
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
      setFormData((prev) => ({ ...prev, customer: '', cnic: result.draft.cnic || prev.cnic }));
      setClientNameQuery(result.draft.full_name || '');
      setCnicLookupStatus(result.draft.cnic ? 'new' : '');
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
    inventoryHydratedRef.current = false;
    setInventoryLoading(true);
    setInventoryLines([]);
    try {
      const res = await client.get(
        `/inventory/booking-items/?booking=${bookingId}&page_size=1000`
      );
      const rows = res.data.results || res.data || [];
      const mapped = rows.map((r) => ({
        id: r.id,
        inventory_item: String(r.inventory_item),
        quantity_used: r.quantity_used,
        original_quantity: r.quantity_used,
        include_in_bill: Boolean(r.include_in_bill),
        item_name: r.item_name || '',
        item_price: r.item_price,
        unit_price: r.unit_price ?? r.item_price ?? '',
        item_unit: r.item_unit || 'units',
      }));
      setInventoryLines(mapped);
      // Keep allocated items visible even if missing from the current catalog page.
      setInventoryCatalog((prev) => {
        const byId = new Map(prev.map((item) => [String(item.id), item]));
        for (const row of rows) {
          const id = String(row.inventory_item);
          if (byId.has(id)) continue;
          byId.set(id, {
            id: row.inventory_item,
            name: row.item_name || `Item #${id}`,
            unit: row.item_unit || 'units',
            price_per_unit: row.item_price ?? 0,
            quantity: 0,
            status: 'IN_STOCK',
          });
        }
        return Array.from(byId.values());
      });
    } catch {
      setInventoryLines([]);
      toast.error('Failed to load booking inventory items');
    } finally {
      inventoryHydratedRef.current = true;
      setInventoryLoading(false);
    }
  };

  const syncBookingInventory = async (bookingId, lines = inventoryLines) => {
    if (!inventoryHydratedRef.current) {
      throw new Error('Inventory is still loading');
    }
    const res = await client.get(
      `/inventory/booking-items/?booking=${bookingId}&page_size=1000`
    );
    const existing = res.data.results || res.data || [];
    const retainedIds = new Set(
      lines.filter((line) => line.id).map((line) => Number(line.id))
    );
    for (const line of lines.filter((candidate) => candidate.id)) {
      const qty = parseInt(line.quantity_used, 10);
      if (!qty || qty <= 0) continue;
      await client.patch(`/inventory/booking-items/${line.id}/`, {
        quantity_used: qty,
        include_in_bill: Boolean(line.include_in_bill),
        unit_price: Number(line.unit_price || 0),
      });
    }
    await Promise.all(
      existing
        .filter((allocation) => !retainedIds.has(Number(allocation.id)))
        .map((allocation) => client.delete(`/inventory/booking-items/${allocation.id}/`))
    );
    for (const line of lines.filter((candidate) => !candidate.id)) {
      const itemId = parseInt(line.inventory_item, 10);
      const qty = parseInt(line.quantity_used, 10);
      if (!itemId || !qty || qty <= 0) continue;
      await client.post('/inventory/booking-items/', {
        booking: bookingId,
        inventory_item: itemId,
        quantity_used: qty,
        include_in_bill: Boolean(line.include_in_bill),
        unit_price: Number(line.unit_price || 0),
      });
    }
  };

  const loadBookingServices = async (bookingId) => {
    servicesHydratedRef.current = false;
    setServiceLines([]);
    try {
      const rows = await listBookingServices(bookingId);
      setServiceLines(rows.map((r) => ({
        id: r.id,
        service: String(r.service),
        quantity: r.quantity,
        include_in_bill: r.include_in_bill !== false,
        unit_price: r.unit_price ?? r.service_price ?? '',
        service_label: r.service_label || '',
        service_price: r.service_price,
        pricing_unit: r.pricing_unit || 'PER_EVENT',
      })));
      setServiceCatalog((prev) => {
        const byId = new Map(prev.map((item) => [String(item.id), item]));
        for (const row of rows) {
          const id = String(row.service);
          if (byId.has(id)) continue;
          byId.set(id, {
            id: row.service,
            label: row.service_label || `Service #${id}`,
            price: row.service_price ?? 0,
            pricing_unit: row.pricing_unit || 'PER_EVENT',
            is_active: true,
          });
        }
        return Array.from(byId.values());
      });
    } catch {
      setServiceLines([]);
      toast.error('Failed to load booking services');
    } finally {
      servicesHydratedRef.current = true;
    }
  };

  const syncBookingServices = async (bookingId, lines = serviceLines) => {
    if (!servicesHydratedRef.current) {
      throw new Error('Services are still loading');
    }
    const existing = await listBookingServices(bookingId);
    const retainedIds = new Set(
      lines.filter((line) => line.id).map((line) => Number(line.id))
    );
    for (const line of lines.filter((candidate) => candidate.id)) {
      const qty = parseInt(line.quantity, 10);
      if (!qty || qty <= 0) continue;
      await updateBookingService(line.id, {
        quantity: qty,
        include_in_bill: Boolean(line.include_in_bill),
        unit_price: Number(line.unit_price || 0),
      });
    }
    await Promise.all(
      existing
        .filter((allocation) => !retainedIds.has(Number(allocation.id)))
        .map((allocation) => deleteBookingService(allocation.id))
    );
    for (const line of lines.filter((candidate) => !candidate.id)) {
      const serviceId = parseInt(line.service, 10);
      const qty = parseInt(line.quantity, 10);
      if (!serviceId || !qty || qty <= 0) continue;
      await createBookingService({
        booking: bookingId,
        service: serviceId,
        quantity: qty,
        include_in_bill: Boolean(line.include_in_bill),
        unit_price: Number(line.unit_price || 0),
      });
    }
  };

  const hallsForSelect = halls.filter((h) => {
    const selectedIds = new Set(formVenueIds(formData));
    const isActive = h.status !== 'INACTIVE' || selectedIds.has(String(h.id));
    if (!isActive) return false;
    if (selectedIds.has(String(h.id))) return true;
    if (!formData.event_date || !isSlotReady(formData)) return true;
    return hallAvailableOnDate(
      h,
      formData.event_date,
      bookings,
      editingId,
      formData.slot,
      formData.custom_start_time,
      formData.custom_end_time,
    );
  });

  const assignAvailableHall = (next, eventDate) => {
    const merged = { ...next, event_date: eventDate };
    const ids = formVenueIds(merged);
    if (!eventDate || !ids.length) {
      return withVenues(merged, ids);
    }
    const kept = ids.filter((id) => {
      const selected = halls.find((hall) => String(hall.id) === id);
      return selected
        && (selected.status !== 'INACTIVE' || ids.includes(String(selected.id)))
        && hallAvailableOnDate(
          selected,
          eventDate,
          bookings,
          editingId,
          merged.slot,
          merged.custom_start_time,
          merged.custom_end_time,
        );
    });
    return withVenues(merged, kept);
  };

  const toggleHallSelection = (hall) => {
    const current = formVenueIds(formData);
    const id = String(hall.id);
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    const first = halls.find((item) => String(item.id) === next[0]);
    lockedGrandTotalRef.current = null;
    setGrandTotalDraft(null);
    setFormData(withVenues({
      ...formData,
      rate_per_head: first ? (first.price_per_day || first.price_per_head || 1200) : 1200,
    }, next));
    if (!current.includes(id) && next.length === 1 && hallsForSelect.length <= 1) {
      advanceReservationStep('hall', { venue: next[0], venues: next });
    }
  };

  const availableInventoryCatalog = inventoryCatalog.filter((item) => item.status !== 'INACTIVE');
  const availableServiceCatalog = serviceCatalog.filter((item) => item.is_active !== false);

  const handleCreateNewClick = (prefill = {}) => {
    if (!canManage) {
      toast.error('You do not have permission to create bookings.');
      return;
    }
    const seeded = {
      ...(prefill.event_date ? { event_date: prefill.event_date } : {}),
      ...(prefill.customer ? { customer: String(prefill.customer) } : {}),
      ...(prefill.venue ? { venue: String(prefill.venue), venues: [String(prefill.venue)] } : {}),
      ...(prefill.slot ? { slot: prefill.slot } : {}),
      ...(prefill.rate_per_head != null ? { rate_per_head: prefill.rate_per_head } : {}),
    };
    resetForm(
      prefill.event_date && !prefill.venue
        ? assignAvailableHall(seeded, prefill.event_date)
        : seeded
    );
    if (prefill.customer) {
      setNewCustomerMode(false);
    }
    setViewMode('create');
  };

  const populateBookingForm = async (booking) => {
    setEditingId(booking.id);
    setFormData({
      booking_id: booking.booking_id || displayBookingId(booking),
      event_name: booking.event_name,
      customer: booking.customer,
      venue: bookingVenueIds(booking)[0] || booking.venue || '',
      venues: bookingVenueIds(booking),
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
    setClientNameQuery(booking.customer_name || '');
    setCnicLookupStatus(booking.cnic ? 'found' : '');
    setSelectedDecorationId(booking.decoration_package ? String(booking.decoration_package) : '');
    setInvoiceCollectNow('');
    lockedGrandTotalRef.current = null;
    setGrandTotalDraft(null);
    await Promise.all([
      loadBookingInventory(booking.id),
      loadBookingServices(booking.id),
    ]);
  };

  const handleEditClick = async (booking) => {
    if (!canManage) {
      toast.error('You do not have permission to edit bookings.');
      return;
    }
    await populateBookingForm(booking);
    setViewMode('edit');
  };

  const handleInvoiceClick = async (booking) => {
    if (!canManage) {
      toast.error('You do not have permission to edit invoices.');
      return;
    }
    if (isPostedBooking(booking.booking_status)) {
      toast.error('Posted or cancelled bookings cannot be invoiced.');
      return;
    }
    await populateBookingForm(booking);
    setViewMode('invoice');
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
    const prefillEventDate = location.state?.prefillEventDate;
    const prefillVenue = location.state?.prefillVenue;
    const prefillSlot = location.state?.prefillSlot;
    handleCreateNewClick({
      customer: prefillCustomer,
      event_date: prefillEventDate,
      venue: prefillVenue,
      slot: prefillSlot,
    });
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openCreate, location.state?.prefillCustomer, location.state?.prefillEventDate, location.state?.prefillVenue, location.state?.prefillSlot, canManage, navigate, location.pathname]);

  useEffect(() => {
    if (isFormLocked || !formData.event_date || !formVenueIds(formData).length || !halls.length) return;
    setFormData((prev) => {
      const ids = formVenueIds(prev);
      if (!prev.event_date || !ids.length) return prev;
      const kept = ids.filter((id) => {
        const selected = halls.find((h) => String(h.id) === id);
        return selected && hallAvailableOnDate(
          selected,
          prev.event_date,
          bookings,
          editingId,
          prev.slot,
          prev.custom_start_time,
          prev.custom_end_time,
        );
      });
      if (kept.length === ids.length) return prev;
      return withVenues(prev, kept);
    });
  }, [halls, bookings, formData.event_date, formData.venue, formData.venues, formData.slot, formData.custom_start_time, formData.custom_end_time, isFormLocked, editingId]);

  useEffect(() => {
    if (viewMode !== 'list') return undefined;
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = String(target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
      if (typing) return;
      if (event.key === '/') {
        event.preventDefault();
        document.getElementById('bookings-list-search')?.focus();
        return;
      }
      if (canManage && (event.key === 'n' || event.key === 'N')) {
        event.preventDefault();
        handleCreateNewClick();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, canManage]);

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
    const cnicError = validateCnic(newCustomer.cnic || formData.cnic);
    if (cnicError) errors.cnic = cnicError;
    setNewCustomerErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateNewCustomerField = (field, value) => {
    setNewCustomer((current) => ({ ...current, [field]: value }));
    setNewCustomerErrors((current) => ({ ...current, [field]: '' }));
  };

  const beginNewClientDraft = (overrides = {}) => {
    setNewCustomerMode(true);
    setFormData((prev) => ({ ...prev, customer: '' }));
    setNewCustomer((current) => ({
      full_name: overrides.full_name ?? current.full_name,
      cnic: overrides.cnic ?? current.cnic,
      email: overrides.email ?? current.email,
      phone: overrides.phone ?? current.phone,
      address: overrides.address ?? current.address,
    }));
    if (overrides.full_name != null) setClientNameQuery(overrides.full_name);
  };

  const clearClientIdentityKeepCnic = (formattedCnic) => {
    setFormData((prev) => ({ ...prev, customer: '', cnic: formattedCnic }));
    setNewCustomer({
      full_name: '',
      cnic: formattedCnic,
      email: '',
      phone: '',
      address: '',
    });
    setClientNameQuery('');
    setNewCustomerMode(false);
    setCnicLookupStatus('');
    setNewCustomerErrors({});
  };

  const handleClientCnicChange = (rawValue) => {
    const formatted = formatCnicInput(rawValue);
    const digits = cnicDigits(formatted);

    if (digits.length < 13) {
      clearClientIdentityKeepCnic(formatted);
      return;
    }

    const match = findCustomerByCnic(customers, formatted);
    if (match) {
      selectClientFromScan(match);
      setCnicLookupStatus('found');
      return;
    }

    beginNewClientDraft({
      cnic: formatted,
      full_name: '',
      phone: '',
      address: '',
    });
    setClientNameQuery('');
    setCnicLookupStatus('new');
    toast('CNIC not registered — enter name & phone, then press Enter', {
      id: 'booking-cnic-lookup',
      icon: 'ℹ️',
    });
  };

  const handleClientPhoneChange = (rawValue) => {
    const formatted = formatPakPhone(rawValue);
    if (formData.customer && !newCustomerMode) {
      const selected = customers.find((c) => String(c.id) === String(formData.customer));
      beginNewClientDraft({
        full_name: clientNameQuery || customerDisplayName(selected),
        phone: formatted,
        cnic: selected?.cnic || formData.cnic || '',
        address: selected?.address || newCustomer.address || '',
      });
      setCnicLookupStatus(cnicDigits(selected?.cnic || formData.cnic).length === 13 ? 'new' : '');
      return;
    }
    if (!newCustomerMode) {
      beginNewClientDraft({
        full_name: clientNameQuery,
        phone: formatted,
        cnic: formData.cnic || newCustomer.cnic || '',
        address: newCustomer.address || '',
      });
      return;
    }
    updateNewCustomerField('phone', formatted);
  };

  const handleClientAddressChange = (value) => {
    if (formData.customer && !newCustomerMode) {
      const selected = customers.find((c) => String(c.id) === String(formData.customer));
      beginNewClientDraft({
        full_name: clientNameQuery || customerDisplayName(selected),
        phone: selected?.phone || newCustomer.phone || '',
        cnic: selected?.cnic || formData.cnic || '',
        address: value,
      });
      setCnicLookupStatus(cnicDigits(selected?.cnic || formData.cnic).length === 13 ? 'new' : '');
      return;
    }
    if (!newCustomerMode) {
      beginNewClientDraft({
        full_name: clientNameQuery,
        phone: newCustomer.phone || '',
        cnic: formData.cnic || newCustomer.cnic || '',
        address: value,
      });
      return;
    }
    updateNewCustomerField('address', value);
  };

  const handleClientNameChange = (value) => {
    setClientNameQuery(value);
    if (formData.customer && !newCustomerMode) {
      const selected = customers.find((c) => String(c.id) === String(formData.customer));
      const selectedName = customerDisplayName(selected);
      if (value.trim() !== selectedName) {
        beginNewClientDraft({
          full_name: value,
          phone: selected?.phone || '',
          cnic: selected?.cnic || formData.cnic || '',
          address: selected?.address || newCustomer.address || '',
        });
        setCnicLookupStatus(cnicDigits(selected?.cnic || formData.cnic).length === 13 ? 'new' : '');
      }
      return;
    }
    if (!newCustomerMode && value.trim()) {
      beginNewClientDraft({
        full_name: value,
        phone: newCustomer.phone || '',
        cnic: formData.cnic || newCustomer.cnic || '',
        address: newCustomer.address || '',
      });
      return;
    }
    updateNewCustomerField('full_name', value);
  };

  const handleClientNameKeyDown = async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const name = clientNameQuery.trim();
    if (!name && formData.customer) {
      advanceReservationStep('client-name', { customer: formData.customer });
      return;
    }
    if (!name) return;

    const exact = customers.find(
      (c) => customerDisplayName(c).toLowerCase() === name.toLowerCase()
    );
    if (exact) {
      selectClientFromScan(exact);
      advanceReservationStep('client-name', { customer: exact.id });
      return;
    }

    if (formData.customer) {
      advanceReservationStep('client-name', { customer: formData.customer });
      return;
    }

    if (!newCustomerMode) {
      beginNewClientDraft({
        full_name: name,
        phone: newCustomer.phone || '',
        cnic: formData.cnic || newCustomer.cnic || '',
        address: newCustomer.address || '',
      });
    } else {
      updateNewCustomerField('full_name', name);
    }

    await handleSaveNewCustomerInline({
      full_name: name,
      phone: newCustomer.phone || '',
      cnic: formData.cnic || newCustomer.cnic || '',
      address: newCustomer.address || '',
    });
  };

  const handleSaveNewCustomerInline = async (overrides = {}) => {
    setBookingError('');
    const draft = { ...newCustomer, ...overrides };
    if (overrides.full_name != null) {
      setNewCustomer((current) => ({ ...current, ...overrides }));
    }
    const errors = {};
    if (!draft.full_name?.trim()) errors.full_name = 'Full name is required.';
    const phoneError = validatePakPhone(draft.phone);
    if (phoneError) errors.phone = phoneError;
    const cnicError = validateCnic(draft.cnic || formData.cnic);
    if (cnicError) errors.cnic = cnicError;
    setNewCustomerErrors(errors);
    if (Object.keys(errors).length > 0) {
      setBookingError('Please complete the highlighted client fields.');
      toast.error(errors.phone || errors.full_name || 'Required fields missing');
      setNewCustomerMode(true);
      return;
    }

    try {
      const customerPayload = buildCustomerPayload(draft);
      const custRes = await client.post('/customers/', customerPayload);
      const savedCust = custRes.data;

      setCustomers((prev) => [...prev, savedCust]);
      setFormData((prev) => ({
        ...prev,
        customer: savedCust.id,
        cnic: savedCust.cnic || draft.cnic || prev.cnic,
      }));
      setNewCustomerMode(false);
      setNewCustomer({
        full_name: '',
        cnic: '',
        email: '',
        phone: '',
        address: '',
      });
      setNewCustomerErrors({});
      setClientNameQuery(customerDisplayName(savedCust));
      setCnicLookupStatus(savedCust.cnic ? 'found' : '');

      toast.success(`Client saved and selected: ${customerDisplayName(savedCust)}`);
      advanceReservationStep('client-name', { customer: savedCust.id });
    } catch (err) {
      const errData = err.response?.data;
      const msg = errData?.non_field_errors?.[0]
        || (typeof Object.values(errData || {})?.[0] === 'object' ? Object.values(errData)?.[0]?.[0] : Object.values(errData)?.[0])
        || 'Failed to save new client details.';
      setBookingError(msg);
      toast.error(msg);
    }
  };

  const ensureLegacyDraftCustomer = async () => {
    const existing = customers.find((c) => (
      customerDisplayName(c) === 'Draft Client'
      || c.notes === '__draft_placeholder__'
    ));
    if (existing) return existing.id;
    const phone = `0399${String(Date.now()).slice(-7)}`;
    const custRes = await client.post('/customers/', buildCustomerPayload({
      full_name: 'Draft Client',
      phone,
      notes: '__draft_placeholder__',
    }));
    setCustomers((prev) => [...prev, custRes.data]);
    return custRes.data.id;
  };

  const buildLegacyDraftPayload = async (base) => {
    const today = new Date().toISOString().split('T')[0];
    let customerId = base.customer;
    if (!customerId) {
      customerId = await ensureLegacyDraftCustomer();
    }
    let venueId = base.venue || formVenueIds(base)[0];
    if (!venueId) {
      const hall = hallsForSelect[0] || halls.find((h) => h.status !== 'INACTIVE') || halls[0];
      if (!hall) {
        throw new Error('No hall available to save draft. Add an active hall first.');
      }
      venueId = hall.id;
    }
    const venueIds = formVenueIds({ ...base, venue: venueId, venues: base.venues?.length ? base.venues : [venueId] });
    const slot = base.slot || 'morning';
    return {
      ...base,
      booking_status: 'PENDING',
      customer: Number(customerId),
      venue: Number(venueId),
      venue_ids: venueIds.map((id) => Number(id)),
      event_date: base.event_date || base.booking_date || today,
      slot,
      event_name: base.event_name?.trim() || 'Draft',
      notes: '__draft__',
      custom_start_time: slot === 'custom' ? (base.custom_start_time || null) : null,
      custom_end_time: slot === 'custom' ? (base.custom_end_time || null) : null,
    };
  };

  const handleSubmit = async (e, statusOverride) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (isPosted) {
      toast.error('Posted or cancelled bookings cannot be modified.');
      return;
    }
    setBookingError('');
    const isDraft = viewMode === 'create' && statusOverride === 'DRAFT';

    if ((viewMode === 'edit' || viewMode === 'invoice') && (!inventoryHydratedRef.current || !servicesHydratedRef.current)) {
      toast.error('Add-ons are still loading. Please wait a moment and try again.');
      return;
    }

    if (viewMode === 'invoice') {
      const collect = Number(invoiceCollectNow || 0);
      const dueBefore = grandTotal - Number(formData.advance_paid || 0);
      if (!Number.isFinite(collect) || collect < 0) {
        setBookingError('Enter a valid amount to collect now.');
        toast.error('Invalid collect amount');
        return;
      }
      if (collect - dueBefore > 0.009) {
        setBookingError(
          `Collect now (PKR ${collect.toLocaleString()}) cannot exceed balance due (PKR ${Math.max(0, dueBefore).toLocaleString()}).`
        );
        toast.error('Collect amount exceeds balance due');
        return;
      }
    }

    // Only validate inventory lines that were started (item selected or qty entered)
    const filledInventoryLines = inventoryLines.filter(
      (line) => line.inventory_item || Number(line.quantity_used) > 0 || line.include_in_bill
    );
    const selectedInventoryIds = new Set();
    for (const line of filledInventoryLines) {
      const item = inventoryCatalog.find(
        (candidate) => String(candidate.id) === String(line.inventory_item)
      ) || (line.inventory_item && line.item_name
        ? {
            id: line.inventory_item,
            name: line.item_name,
            price_per_unit: line.item_price,
          }
        : null);
      const quantity = Number(line.quantity_used);
      if (!item) {
        setBookingError('Please select a valid inventory item, or remove empty add-on rows.');
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
    }

    const filledServiceLines = serviceLines.filter(
      (line) => line.service || Number(line.quantity) > 0 || line.include_in_bill
    );
    const selectedServiceIds = new Set();
    for (const line of filledServiceLines) {
      const svc = serviceCatalog.find(
        (candidate) => String(candidate.id) === String(line.service)
      ) || (line.service && line.service_label
        ? { id: line.service, label: line.service_label, price: line.service_price }
        : null);
      const quantity = Number(line.quantity);
      if (!svc) {
        setBookingError('Please select a valid service, or remove empty service rows.');
        toast.error('Invalid service');
        return;
      }
      if (selectedServiceIds.has(String(svc.id))) {
        setBookingError(`${svc.label} is added more than once.`);
        toast.error('Duplicate service');
        return;
      }
      selectedServiceIds.add(String(svc.id));
      if (!Number.isInteger(quantity) || quantity < 1) {
        setBookingError(`Enter a valid quantity for ${svc.label}.`);
        toast.error('Invalid service quantity');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let finalCustomerId = formData.customer;

      // 1. If "Create New Customer" is active and fields were filled, create client first
      if (newCustomerMode) {
        const startedNewClient = Boolean(
          newCustomer.full_name?.trim()
          || newCustomer.phone?.trim()
          || newCustomer.cnic?.trim()
          || newCustomer.email?.trim()
          || newCustomer.address?.trim()
        );
        if (startedNewClient) {
          if (!isDraft && !validateNewCustomerFields()) {
            setBookingError('Please complete the highlighted client fields.');
            toast.error('Required client fields missing');
            setIsSubmitting(false);
            return;
          }
          if (isDraft && (!newCustomer.full_name?.trim() || !newCustomer.phone?.trim())) {
            // Draft: only create client if both name + phone are filled; otherwise skip
            finalCustomerId = '';
          } else if (newCustomer.full_name?.trim() && newCustomer.phone?.trim()) {
            if (!validateNewCustomerFields()) {
              setBookingError('Please complete the highlighted client fields.');
              toast.error('Required client fields missing');
              setIsSubmitting(false);
              return;
            }
            const customerPayload = buildCustomerPayload(newCustomer);
            const custRes = await client.post('/customers/', customerPayload);
            finalCustomerId = custRes.data.id;
            toast.success(`Client profile created: ${newCustomer.full_name.trim()}`);
          }
        }
      }

      if (!isDraft) {
        if (!finalCustomerId) {
          setBookingError('Please select a customer or create a new client profile.');
          setIsSubmitting(false);
          return;
        }
        if (!formVenueIds(formData).length) {
          setBookingError('Please select a venue hall.');
          toast.error('Venue required');
          setIsSubmitting(false);
          return;
        }
        if (!formData.slot) {
          setBookingError('Please select a timing slot.');
          toast.error('Timing required');
          setIsSubmitting(false);
          return;
        }
        if (formData.slot === 'custom' && (!formData.custom_start_time || !formData.custom_end_time)) {
          setBookingError('Please enter both start and end time for the custom slot.');
          toast.error('Custom start and end time required');
          setIsSubmitting(false);
          return;
        }
      }

      // 2. Build booking payload from filled fields only (draft allows nulls)
      const selectedCustomer = customers.find((c) => String(c.id) === String(finalCustomerId));
      const bookingCnic = newCustomerMode
        ? (newCustomer.cnic || '')
        : (selectedCustomer?.cnic || '');
      const payload = {
        booking_id: (viewMode === 'edit' || viewMode === 'invoice')
          ? (formData.booking_id || undefined)
          : undefined,
        booking_status: statusOverride || formData.booking_status,
        event_name: formData.event_name?.trim() || (isDraft ? 'Draft' : formData.event_name),
        booking_date: formData.booking_date || new Date().toISOString().split('T')[0],
        event_date: formData.event_date || null,
        slot: formData.slot || null,
        cnic: bookingCnic || '',
        customer: finalCustomerId ? parseInt(finalCustomerId, 10) : null,
        venue: formVenueIds(formData)[0] ? parseInt(formVenueIds(formData)[0], 10) : null,
        venue_ids: formVenueIds(formData).map((id) => parseInt(id, 10)),
        custom_start_time: formData.slot === 'custom' ? (formData.custom_start_time || null) : null,
        custom_end_time: formData.slot === 'custom' ? (formData.custom_end_time || null) : null,
        gents_count: parseInt(formData.gents_count || 0, 10) || 0,
        ladies_count: parseInt(formData.ladies_count || 0, 10) || 0,
        rate_per_head: parseFloat(formData.rate_per_head || 0) || 0,
        overtime_hours: parseFloat(formData.overtime_hours || 0) || 0,
        kitchen_charge: parseFloat(formData.kitchen_charge || 0) || 0,
        decoration_charge: parseFloat(formData.decoration_charge || 0) || 0,
        decoration_package: selectedDecorationId ? parseInt(selectedDecorationId, 10) : null,
        deg_count: parseInt(formData.deg_count || 0, 10) || 0,
        generator_charge: parseFloat(formData.generator_charge || 0) || 0,
        advance_paid: parseFloat(formData.advance_paid || 0) || 0,
        total_price: parseFloat(grandTotal) || 0,
        ...(isDraft ? { notes: '__draft__' } : {}),
      };

      let bookingId = editingId;
      if (viewMode === 'edit' || viewMode === 'invoice') {
        await client.put(`/bookings/${editingId}/`, payload);
        if (viewMode === 'invoice') {
          const collect = Number(invoiceCollectNow || 0);
          if (collect > 0) {
            try {
              await client.post('/finance/payments/', {
                booking: editingId,
                amount: collect,
                payment_method: 'CASH',
                status: 'COMPLETED',
                notes: 'Collected on invoice confirm',
              });
              toast.success(`Invoice updated · PKR ${collect.toLocaleString()} collected`);
            } catch (payErr) {
              const payMsg = payErr?.response?.data?.detail
                || payErr?.response?.data?.amount?.[0]
                || 'Invoice saved but payment could not be recorded';
              toast.error(typeof payMsg === 'string' ? payMsg : 'Invoice saved but payment could not be recorded');
            }
          } else {
            toast.success('Invoice updated successfully');
          }
        } else {
          toast.success('Reservation updated successfully');
        }
      } else {
        let created;
        try {
          created = await client.post('/bookings/', payload);
        } catch (err) {
          if (!isDraft) throw err;
          try {
            // Older live API: no DRAFT status — try PENDING with same payload.
            created = await client.post('/bookings/', { ...payload, booking_status: 'PENDING' });
          } catch (err2) {
            // Older live API: customer/venue/slot/date still required — fill safe defaults.
            const legacyPayload = await buildLegacyDraftPayload(payload);
            created = await client.post('/bookings/', legacyPayload);
          }
        }
        bookingId = created.data.id;
        toast.success(isDraft ? 'Draft saved' : 'Reservation saved successfully');
      }

      // Always sync on edit/invoice (empty = clear). On create, sync when lines exist.
      const shouldSyncInventory =
        bookingId
        && (
          viewMode === 'edit'
          || viewMode === 'invoice'
          || filledInventoryLines.length > 0
        );
      if (shouldSyncInventory) {
        try {
          await syncBookingInventory(bookingId, filledInventoryLines);
        } catch {
          toast.error('Booking saved but inventory allocation failed');
        }
      }
      const shouldSyncServices =
        bookingId
        && (
          viewMode === 'edit'
          || viewMode === 'invoice'
          || filledServiceLines.length > 0
        );
      if (shouldSyncServices) {
        try {
          await syncBookingServices(bookingId, filledServiceLines);
        } catch {
          toast.error('Booking saved but service allocation failed');
        }
      }

      resetForm();
      setViewMode('list');
      fetchData();
    } catch (err) {
      const errData = err?.response?.data;
      const status = err?.response?.status;
      let msg = err?.message || 'Failed to save booking details.';
      const looksLikeHtml = (value) => {
        const text = String(value || '');
        return /<!doctype|<html[\s>]|Server Error \(500\)/i.test(text);
      };
      if (typeof errData === 'string') {
        msg = looksLikeHtml(errData)
          ? 'Server error while saving booking. Please try again, or contact admin if it continues.'
          : errData;
      } else if (errData?.detail) {
        msg = Array.isArray(errData.detail) ? errData.detail[0] : String(errData.detail);
      } else if (errData?.non_field_errors?.[0]) {
        msg = errData.non_field_errors[0];
      } else if (errData && typeof errData === 'object' && !looksLikeHtml(errData)) {
        const firstKey = Object.keys(errData)[0];
        const firstVal = errData[firstKey];
        const text = Array.isArray(firstVal) ? firstVal[0] : firstVal;
        msg = firstKey && text ? `${firstKey}: ${text}` : String(text || msg);
      } else if (status === 500 || looksLikeHtml(errData)) {
        msg = 'Server error while saving booking. Please try again, or contact admin if it continues.';
      }
      if (looksLikeHtml(msg)) {
        msg = 'Server error while saving booking. Please try again, or contact admin if it continues.';
      }
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
  const bookingEventDate = (booking) => {
    const raw = booking?.event_date || booking?.start_date || '';
    return String(raw).slice(0, 10);
  };
  const filteredBookings = bookings
    .filter((b) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || (
        (b.event_name || '').toLowerCase().includes(q)
        || (b.customer_name || '').toLowerCase().includes(q)
        || (b.venue_name || '').toLowerCase().includes(q)
        || (b.booking_id || '').toLowerCase().includes(q)
        || displayBookingId(b).toLowerCase().includes(q)
      );
      const matchesDate = !eventDateFilter || bookingEventDate(b) === eventDateFilter;
      const status = b.booking_status;
      const matchesStatus = statusFilter === 'cancelled'
        ? status === 'CANCELLED'
        : statusFilter === 'all'
          ? true
          : status !== 'CANCELLED';
      return matchesSearch && matchesDate && matchesStatus;
    })
    .sort((a, b) => {
      // Newest created booking always on top (any event day)
      const createdA = a.created_at || '';
      const createdB = b.created_at || '';
      if (createdA && createdB && createdA !== createdB) {
        return createdB.localeCompare(createdA);
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });

  const bookingRecencyValue = (booking) => {
    if (booking?.created_at) return String(booking.created_at);
    // Zero-pad id so numeric string compare matches newest-first
    return `id:${String(booking?.id || 0).padStart(12, '0')}`;
  };

  const selectedCustomer = customers.find((c) => String(c.id) === String(formData.customer));
  const selectedVenueIds = formVenueIds(formData);
  const selectedHalls = halls.filter((h) => selectedVenueIds.includes(String(h.id)));
  const combinedHallCapacity = selectedHalls.reduce((sum, hall) => sum + Number(hall.capacity || 0), 0);
  const availableGuestSeats = selectedHalls.length
    ? selectedHalls.reduce((sum, hall) => (
      sum + availableSeatsOnDate(
        hall,
        formData.event_date,
        bookings,
        editingId,
        formData.slot,
        formData.custom_start_time,
        formData.custom_end_time,
      )
    ), 0)
    : null;

  const guestOverCapacity = availableGuestSeats != null
    && totalAttendance > availableGuestSeats;
  const clientPhoneValue = newCustomerMode
    ? (newCustomer.phone || '')
    : (selectedCustomer?.phone || '');
  const clientCnicValue = newCustomerMode
    ? (newCustomer.cnic || formData.cnic || '')
    : (formData.cnic || selectedCustomer?.cnic || '');
  const clientNameValue = newCustomerMode
    ? (newCustomer.full_name || clientNameQuery)
    : (selectedCustomer ? (clientNameQuery || customerDisplayName(selectedCustomer)) : clientNameQuery);
  const clientAddressValue = newCustomerMode
    ? (newCustomer.address || '')
    : (selectedCustomer?.address || '');
  const stepOneMissing = [
    !formData.booking_date && 'booking date',
    !formData.event_date && 'event date',
    !formData.event_name?.trim() && 'event title',
    cnicDigits(clientCnicValue).length !== 13 && 'CNIC',
    !clientPhoneValue?.trim() && 'phone',
    !clientNameValue?.trim() && 'client name',
  ].filter(Boolean);
  const stepTwoMissing = [
    !selectedVenueIds.length && 'hall',
    !formData.slot && 'time slot',
    formData.slot === 'custom' && (!formData.custom_start_time || !formData.custom_end_time) && 'custom start/end time',
    totalAttendance <= 0 && 'guest count',
  ].filter(Boolean);
  const reservationStep = stepOneMissing.length ? 1 : stepTwoMissing.length ? 2 : 3;
  const showBalanceDue = isInvoice || isEdit || (reservationStep === 3 && grandTotal > 0);
  const eventOptions = Array.from(new Set([
    ...DEFAULT_EVENT_OPTIONS,
    ...bookings.map((booking) => booking.event_name).filter(Boolean),
  ]));
  const filteredEventOptions = eventOptions.filter((name) => (
    name.toLowerCase().includes(formData.event_name.trim().toLowerCase())
  ));
  const safeEventHighlight = Math.min(
    eventHighlightIndex,
    Math.max(0, filteredEventOptions.length - 1),
  );

  useEffect(() => {
    if (!eventOptionsOpen) return undefined;
    const el = document.getElementById(`reservation-event-option-${safeEventHighlight}`);
    el?.scrollIntoView({ block: 'nearest' });
    return undefined;
  }, [eventOptionsOpen, safeEventHighlight, filteredEventOptions.length]);
  const galleryHalls = hallsForSelect
    .filter((hall) => hall.status === 'ACTIVE' && hall.image)
    .sort((a, b) => {
      if (selectedVenueIds.includes(String(a.id)) && !selectedVenueIds.includes(String(b.id))) return -1;
      if (selectedVenueIds.includes(String(b.id)) && !selectedVenueIds.includes(String(a.id))) return 1;
      return 0;
    })
    .slice(0, 3);
  const handleDiscardForm = () => {
    resetForm();
    setViewMode('list');
  };
  const handlePendingSubmit = (event) => {
    handleSubmit(event, 'DRAFT');
  };

  return (
    <div className="animate-fade-in">
        {/* LIST VIEW MODE */}
        {viewMode === 'list' && (
          <>
            <div className="card bookings-table-card" style={{ padding: 0, overflow: 'hidden' }}>
              <DataTable
                variant="erp"
                sortable
                showColumnChooser
                persistColumnsKey="bookings-list"
                getRowClassName={(booking) => (
                  booking.booking_status === 'CANCELLED' ? 'erp-table__row--cancelled' : ''
                )}
                toolbarEnd={canManage ? (
                  <button type="button" className="btn-primary bookings-toolbar-new" onClick={handleCreateNewClick} title="New reservation (N)">
                    <Plus size={16} /> New Reservation
                  </button>
                ) : null}
                toolbarStart={(
                  <>
                    <SearchInput
                      id="bookings-list-search"
                      className="bookings-table-search"
                      placeholder="Search name, hall, or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-keyshortcuts="/"
                    />
                    <div className="bookings-list-filters">
                    <label className="bookings-date-filter">
                      <span>Event date</span>
                      <input
                        type="date"
                        value={eventDateFilter}
                        onChange={(e) => setEventDateFilter(e.target.value)}
                        aria-label="Filter bookings by event date"
                      />
                      {eventDateFilter && (
                        <button
                          type="button"
                          className="bookings-date-filter__clear"
                          onClick={() => setEventDateFilter('')}
                        >
                          Clear
                        </button>
                      )}
                    </label>
                    <label className="bookings-date-filter bookings-status-filter">
                      <span>Status</span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Filter bookings by status"
                      >
                        <option value="active">Active</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="all">All</option>
                      </select>
                    </label>
                    </div>
                  </>
                )}
                pageSize={0}
                emptyTitle="No bookings match your criteria"
                emptyDescription={
                  statusFilter === 'cancelled'
                    ? 'No cancelled bookings match this search or date.'
                    : eventDateFilter
                    ? 'No bookings on this event date. Clear the date filter or pick another day.'
                    : 'Try another search or create a new booking.'
                }
                renderGroupHeader={(key, rows = []) => {
                  const when = key === 'undated' ? null : getBookingDateWhen(key);
                  const tone = when?.key || 'past';
                  return (
                    <div className={`bookings-day-head bookings-day-head--${tone}`}>
                      <div className="bookings-day-head__main">
                        <p className="bookings-day-head__title">
                          {formatBookingDayHeading(key === 'undated' ? '' : key)}
                        </p>
                        <p className="bookings-day-head__count">
                          {rows.length} booking{rows.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      {when && (
                        <span className={`booking-date-when booking-date-when--${when.key}`}>
                          {when.label}
                        </span>
                      )}
                    </div>
                  );
                }}
                columns={[
                  { key: 'booking_id', label: 'Booking ID', width: '128px' },
                  { key: 'customer', label: 'Customer Name' },
                  { key: 'event_name', label: 'Event Type' },
                  { key: 'hall', label: 'Hall' },
                  { key: 'date', label: 'Slot', width: '108px' },
                  { key: 'status', label: 'Status', width: '118px' },
                  { key: 'payment', label: 'Payment', width: '118px' },
                  { key: 'due', label: 'Due', width: '118px' },
                  { key: 'total', label: 'Total', width: '128px' },
                ]}
                data={filteredBookings}
                groupBy={(booking) => bookingEventDate(booking) || 'undated'}
                getGroupSortValue={(key, rows = []) => {
                  // Day group with the most recently created booking floats to top
                  let newest = '';
                  for (const row of rows) {
                    const value = bookingRecencyValue(row);
                    if (value > newest) newest = value;
                  }
                  return newest || (key === 'undated' ? '' : key);
                }}
                getSortValue={(row, key) => {
                  if (key === 'booking_id') return displayBookingId(row);
                  if (key === 'customer') return row.customer_name || '';
                  if (key === 'event_name') return row.event_name || '';
                  if (key === 'hall') return row.venue_name;
                  if (key === 'date') return bookingRecencyValue(row);
                  if (key === 'status') return row.booking_status;
                  if (key === 'payment') return row.payment_status;
                  if (key === 'due') return Number(row.remaining_balance || 0);
                  if (key === 'total') return Number(row.total_price || 0);
                  return row[key];
                }}
                onRowClick={(booking) => handleEditClick(booking)}
                rowActions={(booking) => [
                  ...(canManage ? [{ label: isPostedBooking(booking.booking_status) ? 'View' : 'Edit', icon: <Edit2 size={14} />, onClick: () => handleEditClick(booking) }] : []),
                  ...(canManage && !isPostedBooking(booking.booking_status) ? [{ label: 'Invoice', icon: <FileText size={14} />, onClick: () => handleInvoiceClick(booking) }] : []),
                  { label: 'Print', icon: <Printer size={14} />, onClick: () => handlePrintRowClick(booking) },
                  ...(canManage && !isPostedBooking(booking.booking_status) ? [{ label: 'Cancel', icon: <XCircle size={14} />, danger: true, onClick: () => setCancelTarget(booking) }] : []),
                ]}
                renderCell={(booking, key) => {
                  if (key === 'booking_id') {
                    return <span className="bookings-row-id">{displayBookingId(booking)}</span>;
                  }
                  if (key === 'customer') {
                    return booking.customer ? (
                      <Link
                        to={`/customers/${booking.customer}`}
                        onClick={(e) => e.stopPropagation()}
                        className="bookings-row-customer__name"
                      >
                        {booking.customer_name}
                      </Link>
                    ) : (
                      <span className="bookings-row-customer__name bookings-row-customer__name--plain">
                        {booking.customer_name || 'Draft — no client'}
                      </span>
                    );
                  }
                  if (key === 'event_name') {
                    return <span className="bookings-row-event">{booking.event_name || 'Draft'}</span>;
                  }
                  if (key === 'hall') {
                    return <span className="bookings-row-hall">{booking.venue_name || '—'}</span>;
                  }
                  if (key === 'date') {
                    const slot = String(booking.slot || 'morning').toLowerCase();
                    const slotClass = slot === 'evening'
                      ? 'bookings-row-slot--evening'
                      : slot === 'custom'
                        ? 'bookings-row-slot--custom'
                        : 'bookings-row-slot--morning';
                    return (
                      <span className={`bookings-row-slot ${slotClass}`}>
                        {booking.slot || 'Morning'}
                      </span>
                    );
                  }
                  if (key === 'status') {
                    const st = resolveBookingStatusStyle(booking);
                    return (
                      <span className="bookings-row-pill" style={{ backgroundColor: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    );
                  }
                  if (key === 'payment') {
                    const paid = booking.payment_status === 'PAID';
                    const partial = booking.payment_status === 'PARTIAL';
                    return (
                      <span
                        className="bookings-row-pill"
                        onClick={canAccessPayments ? (e) => {
                          e.stopPropagation();
                          navigate('/payments', {
                            state: {
                              preselectedBookingId: booking.id,
                              bookingEventName: booking.event_name,
                              autoOpenRecord: booking.payment_status !== 'PAID',
                            },
                          });
                        } : undefined}
                        style={{
                          backgroundColor: paid ? '#dcfce7' : partial ? '#ffedd5' : '#fee2e2',
                          color: paid ? '#166534' : partial ? '#c2410c' : '#991b1b',
                          cursor: canAccessPayments ? 'pointer' : 'default',
                        }}
                      >
                        {booking.payment_status}
                      </span>
                    );
                  }
                  if (key === 'due') {
                    const due = hasCollectDue(bookingCollectDue(booking));
                    return (
                      <span className={`bookings-row-money ${due ? 'bookings-row-money--due' : 'bookings-row-money--clear'}`}>
                        {formatCollectDue(bookingCollectDue(booking))}
                      </span>
                    );
                  }
                  if (key === 'total') {
                    return (
                      <span className="bookings-row-money bookings-row-money--total">
                        PKR {parseFloat(booking.total_price || 0).toLocaleString()}
                      </span>
                    );
                  }
                  return null;
                }}
              />
            </div>
          </>
        )}

        {/* Compact reservation workspace */}
        {(viewMode === 'create' || viewMode === 'edit' || viewMode === 'invoice') && (
          <form
            ref={reservationFormRef}
            className={`reservation-console${isInvoice ? ' reservation-console--invoice' : ''}`}
            onSubmit={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || event.defaultPrevented) return;
              const target = event.target;
              if (!(target instanceof HTMLElement)) return;
              if (target.closest('.reservation-console__event-options')) return;
              if (target.closest('.reservation-console__hall-grid, .reservation-console__slot-options, .reservation-console__inventory-actions')) return;
              if (target.matches('.reservation-console__confirm, .reservation-console__hold, .reservation-console__receipt')) return;
              const step = target.getAttribute('data-rs-step')
                || target.closest('[data-rs-step]')?.getAttribute('data-rs-step');
              if (!step || step === 'event-name' || step === 'client-name') return;
              event.preventDefault();
              advanceReservationStep(step);
            }}
          >
            <div className="reservation-console__main">
              <section className="reservation-console__card reservation-console__identity">
                <div className="reservation-console__heading">
                  <h2>
                    <CalendarIcon size={13} />
                    Event &amp; Client Details
                  </h2>
                </div>

                <div className="reservation-console__event-grid">
                  <label>
                    <span>Booking ID</span>
                    <div className="reservation-console__auto-field">
                      <strong>{displayBookingId({ ...formData, id: editingId })}</strong>
                      <em>Auto</em>
                    </div>
                  </label>
                  <label>
                    <span>Booking Date</span>
                    <input data-rs-step="booking-date" type="date" required disabled={isFormLocked} max={formData.event_date || undefined} value={formData.booking_date} onChange={(e) => setFormData({ ...formData, booking_date: e.target.value })} />
                  </label>
                  <label>
                    <span>Event Date *</span>
                    <input
                      data-rs-step="event-date"
                      type="date"
                      required
                      disabled={isFormLocked}
                      min={formData.booking_date || new Date().toISOString().split('T')[0]}
                      value={formData.event_date}
                      onChange={(e) => setFormData(assignAvailableHall(formData, e.target.value))}
                    />
                  </label>
                  <label className="reservation-console__event-picker" ref={eventPickerRef}>
                    <span>Event Title / Occasion</span>
                    <div className="reservation-console__event-input">
                      <input
                        data-rs-step="event-name"
                        type="text"
                        required
                        disabled={isFormLocked}
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={eventOptionsOpen}
                        aria-controls="reservation-event-options"
                        aria-autocomplete="list"
                        aria-activedescendant={
                          eventOptionsOpen && filteredEventOptions[safeEventHighlight]
                            ? `reservation-event-option-${safeEventHighlight}`
                            : undefined
                        }
                        placeholder="Select or type an event"
                        value={formData.event_name}
                        onFocus={() => {
                          const match = filteredEventOptions.findIndex((name) => name === formData.event_name);
                          setEventHighlightIndex(match >= 0 ? match : 0);
                          setEventOptionsOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEventOptionsOpen(false);
                            return;
                          }
                          if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            if (!eventOptionsOpen) {
                              setEventOptionsOpen(true);
                              return;
                            }
                            setEventHighlightIndex((index) => (
                              Math.min(index + 1, Math.max(0, filteredEventOptions.length - 1))
                            ));
                            return;
                          }
                          if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setEventOptionsOpen(true);
                            setEventHighlightIndex((index) => Math.max(index - 1, 0));
                            return;
                          }
                          if (event.key === 'Home' && eventOptionsOpen) {
                            event.preventDefault();
                            setEventHighlightIndex(0);
                            return;
                          }
                          if (event.key === 'End' && eventOptionsOpen) {
                            event.preventDefault();
                            setEventHighlightIndex(Math.max(0, filteredEventOptions.length - 1));
                            return;
                          }
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            if (eventOptionsOpen && filteredEventOptions[safeEventHighlight]) {
                              setFormData({ ...formData, event_name: filteredEventOptions[safeEventHighlight] });
                              setEventOptionsOpen(false);
                              advanceReservationStep('event-name', { event_name: filteredEventOptions[safeEventHighlight] });
                              return;
                            }
                            setEventOptionsOpen(false);
                            advanceReservationStep('event-name');
                          }
                        }}
                        onChange={(event) => {
                          setFormData({ ...formData, event_name: event.target.value });
                          setEventHighlightIndex(0);
                          setEventOptionsOpen(true);
                        }}
                      />
                      <ChevronDown size={16} aria-hidden="true" />
                    </div>
                    {eventOptionsOpen && !isFormLocked && filteredEventOptions.length > 0 && (
                      <div className="reservation-console__event-options" id="reservation-event-options" role="listbox">
                        {filteredEventOptions.map((name, index) => (
                          <button
                            key={name}
                            id={`reservation-event-option-${index}`}
                            type="button"
                            tabIndex={-1}
                            role="option"
                            aria-selected={index === safeEventHighlight}
                            onMouseEnter={() => setEventHighlightIndex(index)}
                            onClick={() => {
                              setFormData({ ...formData, event_name: name });
                              setEventOptionsOpen(false);
                              advanceReservationStep('event-name', { event_name: name });
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
                  <label className={newCustomerErrors.cnic ? 'has-error' : ''}>
                    <span>CNIC/NICOP/POC <em className="reservation-console__req">*</em></span>
                    <input
                      data-rs-step="cnic"
                      type="text"
                      className="reservation-console__mono"
                      required
                      disabled={isFormLocked}
                      maxLength={CNIC_INPUT_MAX_LENGTH}
                      placeholder={CNIC_PLACEHOLDER}
                      value={clientCnicValue ? formatCnicInput(clientCnicValue) : ''}
                      onChange={(e) => handleClientCnicChange(e.target.value)}
                    />
                    {newCustomerErrors.cnic && <small>{newCustomerErrors.cnic}</small>}
                  </label>
                  <label className={newCustomerErrors.phone ? 'has-error' : ''}>
                    <span>Contact <em className="reservation-console__req">*</em></span>
                    <input
                      data-rs-step="phone"
                      type="tel"
                      required
                      disabled={isFormLocked}
                      maxLength={PAK_PHONE_INPUT_MAX_LENGTH}
                      placeholder={PAK_PHONE_PLACEHOLDER}
                      value={clientPhoneValue}
                      onChange={(e) => handleClientPhoneChange(e.target.value)}
                    />
                    {newCustomerErrors.phone && <small>{newCustomerErrors.phone}</small>}
                  </label>
                  <label className={newCustomerErrors.full_name ? 'has-error' : ''}>
                    <span>Client Name <em className="reservation-console__req">*</em></span>
                    <input
                      data-rs-step="client-name"
                      type="text"
                      required
                      disabled={isFormLocked}
                      placeholder="Client name"
                      value={clientNameValue}
                      onChange={(e) => handleClientNameChange(e.target.value)}
                      onKeyDown={handleClientNameKeyDown}
                      autoComplete="off"
                    />
                    {newCustomerErrors.full_name && <small>{newCustomerErrors.full_name}</small>}
                  </label>
                  {newCustomerMode && !isFormLocked && (
                    <label className="reservation-console__client-address-field">
                      <span>Address</span>
                      <input
                        data-rs-step="address"
                        type="text"
                        placeholder="Street, area, city"
                        value={clientAddressValue}
                        onChange={(e) => handleClientAddressChange(e.target.value)}
                      />
                    </label>
                  )}
                </div>
                {cnicLookupStatus === 'new' && !isFormLocked && (
                  <p className="reservation-console__client-hint">
                    CNIC not registered — enter name &amp; phone, then press Enter to add client.
                  </p>
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
                      Select Hall(s)
                      <span className="reservation-console__step-badge">
                        {selectedHalls.length
                          ? `Capacity ${combinedHallCapacity || 0} · Available ${availableGuestSeats ?? 0}`
                          : 'Capacity 0'}
                      </span>
                    </div>
                    {hallsForSelect.length > 0 ? (
                      <div
                        className="reservation-console__hall-grid"
                        onKeyDown={(event) => {
                          const buttons = [...event.currentTarget.querySelectorAll('button')];
                          const current = buttons.indexOf(document.activeElement);
                          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                            event.preventDefault();
                            buttons[(current + 1) % buttons.length]?.focus();
                          }
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                            event.preventDefault();
                            buttons[(current - 1 + buttons.length) % buttons.length]?.focus();
                          }
                        }}
                      >
                        {hallsForSelect.map((hall) => {
                          const selected = selectedVenueIds.includes(String(hall.id));
                          return (
                            <button
                              key={hall.id}
                              type="button"
                              disabled={isFormLocked}
                              className={selected ? 'is-selected' : ''}
                              onClick={() => toggleHallSelection(hall)}
                            >
                              <strong>{hall.name}</strong>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="reservation-console__hall-empty">
                        {formData.event_date
                          ? 'No seats left in this time slot'
                          : 'No active halls available'}
                      </span>
                    )}
                  </div>

                  <div className="reservation-console__guests">
                    <div className="reservation-console__section-label"><Users size={12} /> Guests</div>
                    <div className="reservation-console__steppers">
                      <label>
                        <input
                          type="number"
                          id="reservation-guest-count"
                          data-rs-step="guests"
                          min="0"
                          disabled={isPosted}
                          aria-label="Guest count"
                          placeholder="0"
                          aria-invalid={guestOverCapacity || undefined}
                          value={
                            formData.gents_count === '' && formData.ladies_count === ''
                              ? ''
                              : totalAttendance
                          }
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            advanceReservationStep('guests');
                          }}
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
                    {guestOverCapacity && (
                      <p className="reservation-console__guest-over-capacity" role="status">
                        Over seat limit
                      </p>
                    )}
                  </div>

                  <div className="reservation-console__slot">
                    <div className="reservation-console__section-label"><Timer size={12} /> Time Slot</div>
                    <div
                      className="reservation-console__slot-options"
                      onKeyDown={(event) => {
                        const buttons = [...event.currentTarget.querySelectorAll('button')];
                        const current = buttons.indexOf(document.activeElement);
                        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                          event.preventDefault();
                          buttons[(current + 1) % buttons.length]?.focus();
                        }
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          buttons[(current - 1 + buttons.length) % buttons.length]?.focus();
                        }
                      }}
                    >
                      <button type="button" disabled={isFormLocked} className={formData.slot === 'morning' ? 'is-selected' : ''} onClick={() => {
                        const turningOff = formData.slot === 'morning';
                        setFormData(assignAvailableHall({ ...formData, slot: turningOff ? '' : 'morning', custom_start_time: '', custom_end_time: '' }, formData.event_date));
                        if (!turningOff) advanceReservationStep('slot', { slot: 'morning' });
                      }}>
                        <span>Morning</span>
                        <small>9am – 3pm</small>
                      </button>
                      <button type="button" disabled={isFormLocked} className={formData.slot === 'evening' ? 'is-selected' : ''} onClick={() => {
                        const turningOff = formData.slot === 'evening';
                        setFormData(assignAvailableHall({ ...formData, slot: turningOff ? '' : 'evening', custom_start_time: '', custom_end_time: '' }, formData.event_date));
                        if (!turningOff) advanceReservationStep('slot', { slot: 'evening' });
                      }}>
                        <span>Evening</span>
                        <small>6pm – 12am</small>
                      </button>
                      <button type="button" disabled={isFormLocked} className={formData.slot === 'custom' ? 'is-selected' : ''} onClick={() => {
                        const turningOff = formData.slot === 'custom';
                        setFormData(assignAvailableHall({
                          ...formData,
                          slot: turningOff ? '' : 'custom',
                          custom_start_time: turningOff ? '' : formData.custom_start_time,
                          custom_end_time: turningOff ? '' : formData.custom_end_time,
                        }, formData.event_date));
                        if (!turningOff) {
                          window.setTimeout(() => {
                            document.querySelector('.reservation-console__manual-time input')?.focus();
                          }, 40);
                        }
                      }}>
                        <span>Manual</span>
                        <small>Custom</small>
                      </button>
                    </div>
                    {formData.slot === 'custom' && (
                      <div className="reservation-console__manual-time">
                        <label>
                          <span>From</span>
                          <input
                            type="time"
                            required
                            disabled={isFormLocked}
                            value={formData.custom_start_time}
                            onChange={(event) => setFormData(assignAvailableHall({ ...formData, custom_start_time: event.target.value }, formData.event_date))}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              if (!formData.custom_start_time) {
                                toast.error('Enter start time', { id: 'reservation-step-incomplete' });
                                return;
                              }
                              event.currentTarget.closest('.reservation-console__manual-time')?.querySelector('input[type="time"]:last-of-type')?.focus();
                            }}
                          />
                        </label>
                        <label>
                          <span>To</span>
                          <input
                            type="time"
                            required
                            disabled={isFormLocked}
                            value={formData.custom_end_time}
                            onChange={(event) => setFormData(assignAvailableHall({ ...formData, custom_end_time: event.target.value }, formData.event_date))}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              advanceReservationStep('slot', { slot: 'custom' });
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className={`reservation-console__card reservation-console__inventory${isInvoice ? ' is-invoice-editable' : ''}`}>
                <div className="reservation-console__heading">
                  <h2>
                    <Package size={13} />
                    Inventory &amp; Services
                    {(inventoryLines.length + serviceLines.length) > 0 && (
                      <span>{inventoryLines.length + serviceLines.length} selected</span>
                    )}
                  </h2>
                </div>
                <div className="reservation-console__inventory-toolbar">
                  <div className="reservation-console__inventory-actions">
                    <button
                      type="button"
                      id="reservation-add-inventory"
                      className="reservation-console__add-inventory"
                      disabled={availableInventoryCatalog.length === 0}
                      onClick={() => {
                        setInventoryLines([...inventoryLines, { inventory_item: '', quantity_used: 1, include_in_bill: false, unit_price: '' }]);
                        window.setTimeout(() => {
                          const selects = document.querySelectorAll('.reservation-console__inventory-line--inventory .reservation-console__inventory-field--item select');
                          selects[selects.length - 1]?.focus();
                        }, 40);
                      }}
                    >
                      <Plus size={14} /> Add Inventory
                    </button>
                    <button
                      type="button"
                      id="reservation-add-service"
                      className="reservation-console__add-inventory"
                      disabled={availableServiceCatalog.length === 0}
                      onClick={() => {
                        setServiceLines([...serviceLines, {
                          service: '',
                          quantity: 1,
                          include_in_bill: true,
                          unit_price: '',
                        }]);
                        window.setTimeout(() => {
                          const selects = document.querySelectorAll('.reservation-console__inventory-line--service .reservation-console__inventory-field--item select');
                          selects[selects.length - 1]?.focus();
                        }, 40);
                      }}
                    >
                      <Sparkles size={14} /> Add Service
                    </button>
                  </div>
                </div>
                <div className="reservation-console__inventory-lines">
                  {inventoryLoading && (
                    <div className="reservation-console__inventory-empty">
                      <Package size={18} />
                      <strong>Loading add-ons…</strong>
                      <span>Fetching saved inventory and services for this booking.</span>
                    </div>
                  )}
                  {!inventoryLoading
                    && availableInventoryCatalog.length === 0
                    && availableServiceCatalog.length === 0
                    && inventoryLines.length === 0
                    && serviceLines.length === 0 && (
                    <div className="reservation-console__inventory-empty">
                      <Package size={18} />
                      <strong>No inventory or services yet</strong>
                      <span>Add them from the Inventory or Services pages, then select here.</span>
                    </div>
                  )}
                  {!inventoryLoading
                    && (availableInventoryCatalog.length > 0 || availableServiceCatalog.length > 0)
                    && inventoryLines.length === 0
                    && serviceLines.length === 0 && (
                    <div className="reservation-console__inventory-empty">
                      <Package size={18} />
                      <strong>No add-ons selected</strong>
                      <span>Use Add Inventory or Add Service to include items on this booking.</span>
                    </div>
                  )}
                  {!inventoryLoading && inventoryLines.map((line, index) => {
                    const item = inventoryCatalog.find((candidate) => String(candidate.id) === String(line.inventory_item))
                      || (line.inventory_item && line.item_name
                        ? {
                            id: line.inventory_item,
                            name: line.item_name,
                            unit: line.item_unit || 'units',
                            price_per_unit: line.item_price ?? 0,
                            quantity: 0,
                            status: 'IN_STOCK',
                          }
                        : null);
                    const catalogPrice = item ? Number(item.price_per_unit || 0) : 0;
                    const unitPrice = Number(
                      line.unit_price !== '' && line.unit_price != null
                        ? line.unit_price
                        : catalogPrice
                    );
                    const quantity = Number(line.quantity_used || 0);
                    const billAmount = item && Number.isFinite(quantity) && quantity > 0
                      ? unitPrice * quantity
                      : 0;
                    const savedQtyForItem = item
                      ? inventoryLines.reduce((sum, candidate) => (
                        String(candidate.inventory_item) === String(item.id)
                          ? sum + (Number(candidate.original_quantity) || 0)
                          : sum
                      ), 0)
                      : 0;
                    const formQtyForItem = item
                      ? inventoryLines.reduce((sum, candidate) => (
                        String(candidate.inventory_item) === String(item.id)
                          ? sum + (Number(candidate.quantity_used) || 0)
                          : sum
                      ), 0)
                      : 0;
                    const usedQty = item
                      ? Number(item.allocated_quantity || 0) - savedQtyForItem + formQtyForItem
                      : 0;
                    const availableQty = item
                      ? Number(item.available_quantity != null ? item.available_quantity : item.quantity || 0)
                        + savedQtyForItem
                        - formQtyForItem
                      : 0;
                    const selectedByOtherLines = new Set(
                      inventoryLines
                        .filter((_, itemIndex) => itemIndex !== index)
                        .map((candidate) => String(candidate.inventory_item))
                    );
                    const selectOptions = [...availableInventoryCatalog];
                    if (item && !selectOptions.some((candidate) => String(candidate.id) === String(item.id))) {
                      selectOptions.unshift(item);
                    }
                    return (
                      <div
                        className="reservation-console__inventory-line reservation-console__inventory-line--inventory"
                        key={line.id || `new-inv-${index}-${line.inventory_item || 'empty'}`}
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
                          <span>Inventory</span>
                          <select
                            disabled={Boolean(line.id)}
                            value={line.inventory_item}
                            onChange={(e) => {
                              const selectedItem = availableInventoryCatalog.find(
                                (candidate) => String(candidate.id) === String(e.target.value)
                              );
                              const next = [...inventoryLines];
                              next[index] = {
                                ...next[index],
                                inventory_item: e.target.value,
                                quantity_used: 1,
                                include_in_bill: false,
                                unit_price: selectedItem?.price_per_unit ?? '',
                              };
                              setInventoryLines(next);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              event.currentTarget
                                .closest('.reservation-console__inventory-line')
                                ?.querySelector('.reservation-console__inventory-field--price input')
                                ?.focus();
                            }}
                          >
                            <option value="">Select inventory</option>
                            {selectOptions.map((candidate) => (
                              <option
                                key={candidate.id}
                                value={candidate.id}
                                disabled={selectedByOtherLines.has(String(candidate.id))}
                              >
                                {candidate.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="reservation-console__inventory-field reservation-console__inventory-field--price">
                          <span>Unit Price</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!item}
                            placeholder="0"
                            aria-label={`Unit price for ${item?.name || 'inventory item'}`}
                            value={displayNumField(line.unit_price !== '' && line.unit_price != null ? line.unit_price : (item ? catalogPrice : ''))}
                            onChange={(e) => {
                              const next = [...inventoryLines];
                              next[index] = { ...next[index], unit_price: toFloatField(e.target.value) };
                              setInventoryLines(next);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                                event.preventDefault();
                                return;
                              }
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              event.currentTarget
                                .closest('.reservation-console__inventory-line')
                                ?.querySelector('.reservation-console__inventory-field--qty input')
                                ?.focus();
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </label>

                        <label className="reservation-console__inventory-field reservation-console__inventory-field--qty">
                          <span>Qty</span>
                          <input
                            type="number"
                            min="1"
                            disabled={!item}
                            aria-label={`Quantity for ${item?.name || 'inventory item'}`}
                            value={line.quantity_used}
                            onChange={(e) => {
                              const next = [...inventoryLines];
                              next[index] = { ...next[index], quantity_used: e.target.value };
                              setInventoryLines(next);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              document.getElementById('reservation-add-inventory')?.focus();
                            }}
                          />
                        </label>

                        <div className="reservation-console__inventory-field reservation-console__inventory-field--amount">
                          <span>Total</span>
                          <div className="reservation-console__inventory-readout reservation-console__inventory-readout--amount">
                            {item ? `PKR ${billAmount.toLocaleString()}` : '—'}
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
                        {item && (
                          <p className={`reservation-console__inventory-stock${availableQty < 0 ? ' is-short' : ''}`}>
                            Used {usedQty.toLocaleString()} · Available {availableQty.toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {!inventoryLoading && serviceLines.map((line, index) => {
                    const svc = availableServiceCatalog.find((candidate) => String(candidate.id) === String(line.service))
                      || serviceCatalog.find((candidate) => String(candidate.id) === String(line.service))
                      || (line.service && line.service_label
                        ? {
                            id: line.service,
                            label: line.service_label,
                            price: line.service_price ?? 0,
                            pricing_unit: line.pricing_unit || 'PER_EVENT',
                          }
                        : null);
                    const catalogPrice = svc ? Number(svc.price || 0) : 0;
                    const unitPrice = Number(
                      line.unit_price !== '' && line.unit_price != null
                        ? line.unit_price
                        : catalogPrice
                    );
                    const quantity = Number(line.quantity || 0);
                    const billAmount = svc && Number.isFinite(quantity) && quantity > 0
                      ? unitPrice * quantity
                      : 0;
                    const selectedByOtherLines = new Set(
                      serviceLines
                        .filter((_, itemIndex) => itemIndex !== index)
                        .map((candidate) => String(candidate.service))
                    );
                    const selectOptions = [...availableServiceCatalog];
                    if (svc && !selectOptions.some((candidate) => String(candidate.id) === String(svc.id))) {
                      selectOptions.unshift(svc);
                    }
                    const unitShort = SERVICE_UNIT_SHORT[svc?.pricing_unit || line.pricing_unit] || '/ event';
                    return (
                      <div
                        className="reservation-console__inventory-line reservation-console__inventory-line--service"
                        key={line.id || `new-svc-${index}-${line.service || 'empty'}`}
                      >
                        <label className="reservation-console__inventory-bill" title="Add service price to bill">
                          <input
                            type="checkbox"
                            checked={Boolean(line.include_in_bill)}
                            disabled={!svc}
                            aria-label={`Add ${svc?.label || 'service'} price to bill`}
                            onChange={(e) => {
                              const next = [...serviceLines];
                              next[index] = { ...next[index], include_in_bill: e.target.checked };
                              setServiceLines(next);
                            }}
                          />
                          <span>Bill</span>
                        </label>

                        <label className="reservation-console__inventory-field reservation-console__inventory-field--item">
                          <span>Service</span>
                          <select
                            disabled={Boolean(line.id)}
                            value={line.service}
                            onChange={(e) => {
                              const selected = availableServiceCatalog.find(
                                (candidate) => String(candidate.id) === String(e.target.value)
                              );
                              const next = [...serviceLines];
                              next[index] = {
                                ...next[index],
                                service: e.target.value,
                                quantity: 1,
                                include_in_bill: true,
                                unit_price: selected?.price ?? '',
                                pricing_unit: selected?.pricing_unit || 'PER_EVENT',
                              };
                              setServiceLines(next);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              event.currentTarget
                                .closest('.reservation-console__inventory-line')
                                ?.querySelector('.reservation-console__inventory-field--price input')
                                ?.focus();
                            }}
                          >
                            <option value="">Select service</option>
                            {selectOptions.map((candidate) => (
                              <option
                                key={candidate.id}
                                value={candidate.id}
                                disabled={selectedByOtherLines.has(String(candidate.id))}
                              >
                                {candidate.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="reservation-console__inventory-field reservation-console__inventory-field--price">
                          <span>Unit Price</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!svc}
                            placeholder="0"
                            aria-label={`Unit price for ${svc?.label || 'service'}`}
                            value={displayNumField(line.unit_price !== '' && line.unit_price != null ? line.unit_price : (svc ? catalogPrice : ''))}
                            onChange={(e) => {
                              const next = [...serviceLines];
                              next[index] = { ...next[index], unit_price: toFloatField(e.target.value) };
                              setServiceLines(next);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                                event.preventDefault();
                                return;
                              }
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              event.currentTarget
                                .closest('.reservation-console__inventory-line')
                                ?.querySelector('.reservation-console__inventory-field--qty input')
                                ?.focus();
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </label>

                        <label className="reservation-console__inventory-field reservation-console__inventory-field--qty">
                          <span>Qty</span>
                          <input
                            type="number"
                            min="1"
                            disabled={!svc}
                            aria-label={`Quantity for ${svc?.label || 'service'}`}
                            value={line.quantity}
                            onChange={(e) => {
                              const next = [...serviceLines];
                              next[index] = { ...next[index], quantity: e.target.value };
                              setServiceLines(next);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              document.getElementById('reservation-add-service')?.focus();
                            }}
                          />
                        </label>

                        <div className="reservation-console__inventory-field reservation-console__inventory-field--amount">
                          <span>Total</span>
                          <div className="reservation-console__inventory-readout reservation-console__inventory-readout--amount">
                            {svc ? `PKR ${billAmount.toLocaleString()}` : '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="reservation-console__inventory-remove"
                          aria-label={`Remove ${svc?.label || 'service'}`}
                          onClick={() => setServiceLines(serviceLines.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          ×
                        </button>
                        {svc && (
                          <p className="reservation-console__inventory-stock">
                            Charged {unitShort}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {galleryHalls.length > 0 && (
                <div className="reservation-console__gallery" aria-label="Available hall photos">
                  {galleryHalls.map((hall) => (
                  <figure key={hall.id} className={selectedVenueIds.includes(String(hall.id)) ? 'is-selected' : ''}>
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
                <div><h2>Booking Summary</h2></div>
              </header>
              <div className="reservation-console__summary-lines">
                {summaryVisibility.guests && (
                  <div><span>Guaranteed Guests</span><b>{totalAttendance} PAX</b></div>
                )}
                {summaryVisibility.ratePerHead && (
                  <div>
                    <span>Rate / Head</span>
                    <label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        disabled={isPosted}
                        aria-label="Rate per head"
                        placeholder="0"
                        value={displayNumField(formData.rate_per_head)}
                        onChange={(e) => {
                          lockedGrandTotalRef.current = null;
                          setGrandTotalDraft(null);
                          setFormData({ ...formData, rate_per_head: toFloatField(e.target.value) });
                        }}
                        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </label>
                  </div>
                )}
                {summaryVisibility.venue && (
                  <div><span>Venue</span><b>{subtotal.toLocaleString()}</b></div>
                )}
                {summaryVisibility.combinedServices && extraServices > 0 && (
                  <div><span>Combined Services</span><b>{extraServices.toLocaleString()}</b></div>
                )}
                {summaryVisibility.inventory && addonSummaryLines.map((line) => (
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
                    <option value="DRAFT">Draft</option>
                    <option value="PENDING">Pending / Tentative Hold</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
              )}
              <div className="reservation-console__grand-total">
                <div>
                  <span>Grand Total</span>
                  {isPosted ? (
                    <strong>PKR {grandTotal.toLocaleString()}</strong>
                  ) : (
                    <label className="reservation-console__grand-total-input">
                      <span className="reservation-console__grand-total-prefix">PKR</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        aria-label="Grand total"
                        placeholder="0"
                        value={
                          grandTotalDraft != null
                            ? grandTotalDraft
                            : (grandTotal > 0 ? String(Math.round(grandTotal)) : '')
                        }
                        onFocus={() => {
                          setGrandTotalDraft(
                            grandTotal > 0 ? String(Math.round(grandTotal)) : (grandTotalDraft ?? '')
                          );
                        }}
                        onChange={(e) => applyGrandTotalAsPerHead(e.target.value)}
                        onBlur={commitGrandTotalDraft}
                        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </label>
                  )}
                </div>
                {summaryVisibility.tax && <small>Inclusive Taxes</small>}
              </div>
              <label className="reservation-console__advance">
                <span>{isInvoice ? 'Already Received' : 'Advance Amount Received'}</span>
                <div>PKR <input data-rs-step="advance" type="number" min="0" max={grandTotal || undefined} disabled={isFormLocked} value={displayNumField(formData.advance_paid)} onChange={(e) => setFormData({ ...formData, advance_paid: toFloatField(e.target.value) })} onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }} onWheel={(e) => e.currentTarget.blur()} /></div>
              </label>
              {isInvoice && !isPosted && (
                <label className="reservation-console__advance reservation-console__advance--collect">
                  <span>Collect Now</span>
                  <div>
                    PKR
                    <input
                      type="number"
                      min="0"
                      step="1"
                      max={Math.max(0, remainingBeforeCollect) || undefined}
                      value={displayNumField(invoiceCollectNow)}
                      onChange={(e) => setInvoiceCollectNow(toFloatField(e.target.value))}
                      aria-label="Amount to collect now on invoice"
                      placeholder="0"
                    />
                  </div>
                </label>
              )}
              {showBalanceDue && (
                <div className="reservation-console__balance">
                  <span>Balance Due</span>
                  <strong>{formatCollectDuePKR(remainingBalance)}</strong>
                  <small>
                    {isInvoice && invoiceCollectAmount > 0
                      ? `After collecting PKR ${invoiceCollectAmount.toLocaleString()}`
                      : 'Pending at execution'}
                  </small>
                </div>
              )}
              {bookingError && <div className="reservation-console__error">{bookingError}</div>}
              {!isPosted && (
                <button className="reservation-console__confirm" type="button" data-rs-step="confirm" disabled={isSubmitting || inventoryLoading} onClick={handleSubmit}>
                  {isSubmitting ? 'Saving…' : inventoryLoading ? 'Loading inventory…' : isInvoice ? 'Confirm Invoice' : 'Confirm Booking'}
                </button>
              )}
              {!isPosted && viewMode === 'create' && <button className="reservation-console__hold" type="button" disabled={isSubmitting} onClick={handlePendingSubmit}>{isSubmitting ? 'Saving…' : 'Save Draft'}</button>}
              <div className="reservation-console__utility-actions">
                <button className="reservation-console__receipt" type="button" onClick={() => editingId ? navigate(`/print/${editingId}`) : toast.error('Save reservation first to generate a receipt')}><Download size={12} /> Receipt &amp; PDF</button>
                <button type="button" onClick={handleDiscardForm}>{isInvoice ? 'Discard Invoice' : 'Discard Booking'}</button>
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
                      <input type="text" readOnly value={displayBookingId({ ...formData, id: editingId }) || 'Evnt-YY••••'} style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-dim)', fontWeight: 'bold', fontFamily: 'monospace' }} />
                    </div>
                    <div className="input-group">
                      <label>Booking Date</label>
                      <input type="date" required disabled={isEdit} value={formData.booking_date} onChange={(e) => setFormData({ ...formData, booking_date: e.target.value })} style={isEdit ? { backgroundColor: 'var(--surface-elevated)', color: 'var(--text-dim)', cursor: 'not-allowed' } : {}} />
                    </div>
                    <div className="input-group">
                      <label>Event Date</label>
                      <input type="date" required disabled={isEdit} value={formData.event_date} onChange={(e) => setFormData(assignAvailableHall(formData, e.target.value))} style={isEdit ? { backgroundColor: 'var(--surface-elevated)', color: 'var(--text-dim)', cursor: 'not-allowed' } : {}} />
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
                          {halls.length > 0 && hallsForSelect.length === 0 && (
                            <span style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '8px 12px' }}>No seats left in any hall on this date.</span>
                          )}
                          {hallsForSelect.map(h => {
                            const isSel = selectedVenueIds.includes(String(h.id));
                            return (
                              <button
                                key={h.id}
                                type="button"
                                disabled={isEdit}
                                onClick={() => toggleHallSelection(h)}
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
                          <input
                            type="number"
                            min="0"
                            placeholder="-"
                            value={displayNumField(formData.gents_count)}
                            onChange={(e) => {
                              setFormData({ ...formData, gents_count: toIntField(e.target.value) });
                            }}
                          />
                        </div>
                        <div className="input-group">
                          <label>Ladies Guest</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="-"
                            value={displayNumField(formData.ladies_count)}
                            onChange={(e) => {
                              setFormData({ ...formData, ladies_count: toIntField(e.target.value) });
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: '#fcfcfd', border: '1px solid var(--border)', borderRadius: '12px', marginTop: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', tracking: '0.05em', color: 'var(--text-muted)' }}>Total Attendance</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '24px', fontWeight: '900', color: 'var(--primary)' }}>{totalAttendance}</span>
                          {selectedHalls.length > 0 ? (
                            <p style={{ fontSize: '10px', color: guestOverCapacity ? '#b45309' : 'var(--text-dim)', fontWeight: '500' }}>
                              {guestOverCapacity
                                ? 'Over seat limit'
                                : `(Max Limit: ${combinedHallCapacity})`}
                            </p>
                          ) : null}
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
                                {item.name}
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
                      onClick={() => setInventoryLines([...inventoryLines, { inventory_item: '', quantity_used: 1, include_in_bill: false, unit_price: '' }])}
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
                          onClick={(e) => handleSubmit(e, 'DRAFT')}
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
