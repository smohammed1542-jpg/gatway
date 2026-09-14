import React, { useState, useEffect, useRef } from 'react';
import AppLoader from '../components/AppLoader';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Printer, 
  ChevronLeft, 
  Wallet, 
  FileText, 
  Clock, 
  User,
  Edit,
  Save,
  Check,
  XCircle,
} from 'lucide-react';
import client from '../api/client';
import toast from 'react-hot-toast';
import { formatCollectDuePKR, hasCollectDue } from '../utils/currency';
import AppLogo from '../components/AppLogo';
import { BRAND_FULL_NAME } from '../constants/brand';
import usePersistentState from '../hooks/usePersistentState';
import '../print.css';

// HTML5 Canvas Digital Signature Pad Component
const SignaturePad = ({ label, subtitle, onSave }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#0f172a'; // Deep Navy Ink
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Set canvas resolution for crisp drawing
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    // Initial white background fill
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSigned(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasSigned) {
      onSave(canvas.toDataURL());
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSigned(false);
    onSave(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '12px', fontWeight: '800', color: '#f1f5f9' }}>{label}</span>
        <span style={{ fontSize: '9px', color: '#94a3b8' }}>{subtitle}</span>
      </div>
      
      <div style={{ 
        border: '1px solid rgba(255, 255, 255, 0.1)', 
        borderRadius: '10px', 
        overflow: 'hidden', 
        backgroundColor: 'white', 
        cursor: 'crosshair',
        touchAction: 'none' // Essential to stop scrolling on mobile/tablet while signing
      }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ display: 'block', width: '100%', height: '80px' }}
        />
      </div>
      
      <button 
        type="button" 
        onClick={clear}
        style={{
          alignSelf: 'flex-end',
          padding: '4px 10px',
          fontSize: '9px',
          fontWeight: '700',
          color: hasSigned ? '#ef4444' : '#64748b',
          backgroundColor: hasSigned ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
          border: '1px solid ' + (hasSigned ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)'),
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
      >
        Clear Pad
      </button>
    </div>
  );
};

const PrintDocument = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [booking, setBooking] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [venue, setVenue] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDocType, setActiveDocType] = usePersistentState('print-document-tab', 'final_bill');

  // Digital Signatures Base64 States
  const [officerSig, setOfficerSig] = useState(null);
  const [customerSig, setCustomerSig] = useState(null);

  // Editable State Variables
  const [isEditable, setIsEditable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Language State Variable
  const [printLanguage, setPrintLanguage] = usePersistentState('print-document-language-tab', 'english');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCnic, setCustomerCnic] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  
  const [eventName, setEventName] = useState('');
  const [venueName, setVenueName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [slot, setSlot] = useState('');

  const [gentsCount, setGentsCount] = useState(0);
  const [ladiesCount, setLadiesCount] = useState(0);
  const [ratePerHead, setRatePerHead] = useState(0);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [kitchenCharge, setKitchenCharge] = useState(0);
  const [decorationCharge, setDecorationCharge] = useState(0);
  const [generatorCharge, setGeneratorCharge] = useState(0);
  const [advancePaid, setAdvancePaid] = useState(0);
  const [inventoryBillLines, setInventoryBillLines] = useState([]);

  useEffect(() => {
    const fetchPrintData = async () => {
      setIsLoading(true);
      try {
        const bookingRes = await client.get(`/bookings/${bookingId}/`);
        const bookingData = bookingRes.data;
        setBooking(bookingData);

        // Populate initial editable states
        setEventName(bookingData.event_name || '');
        setVenueName(bookingData.venue_name || '');
        setEventDate(bookingData.event_date || '');
        setSlot(bookingData.slot || 'evening');
        
        setGentsCount(Number(bookingData.gents_count || 0));
        setLadiesCount(Number(bookingData.ladies_count || 0));
        setRatePerHead(Number(bookingData.rate_per_head || 0));
        setOvertimeHours(Number(bookingData.overtime_hours || 0));
        setKitchenCharge(Number(bookingData.kitchen_charge || 0));
        setDecorationCharge(Number(bookingData.decoration_charge || 0));
        setGeneratorCharge(Number(bookingData.generator_charge || 0));
        setAdvancePaid(Number(bookingData.advance_paid || 0));
        setCustomerCnic(bookingData.cnic || '');

        const [customerRes, venueRes, inventoryRes] = await Promise.all([
          client.get(`/customers/${bookingData.customer}/`),
          client.get(`/venues/${bookingData.venue}/`),
          client.get(`/inventory/booking-items/?booking=${bookingId}`).catch(() => ({ data: [] })),
        ]);
        
        setCustomer(customerRes.data);
        const c = customerRes.data;
        setCustomerName((c.full_name || `${c.first_name || ''} ${c.last_name || ''}`).trim());
        setCustomerPhone(customerRes.data.phone || '');
        setCustomerAddress(customerRes.data.address || '');
        
        setVenue(venueRes.data);
        if (!bookingData.venue_name) {
          setVenueName(venueRes.data.name || '');
        }

        const inventoryRows = inventoryRes.data?.results || inventoryRes.data || [];
        setInventoryBillLines(
          (Array.isArray(inventoryRows) ? inventoryRows : []).map((row) => {
            const unitPrice = Number(row.item_price || 0);
            const quantity = Number(row.quantity_used || 0);
            return {
              id: row.id,
              name: row.item_name || 'Add-on item',
              unitPrice,
              quantity,
              price: unitPrice * (Number.isFinite(quantity) && quantity > 0 ? quantity : 0),
              includeInBill: Boolean(row.include_in_bill),
            };
          })
        );
      } catch (err) {
        console.error(err);
        toast.error('Failed to load printing data');
      } finally {
        setIsLoading(false);
      }
    };

    if (bookingId) {
      fetchPrintData();
    }
  }, [bookingId]);

  useEffect(() => {
    if (!booking) return;
    const doc = searchParams.get('doc');
    if (doc === 'cancellation' || booking.booking_status === 'CANCELLED') {
      setActiveDocType('cancellation_notice');
    }
  }, [booking, searchParams]);

  if (isLoading) {
    return <AppLoader fullScreen message="Preparing document…" />;
  }

  if (!booking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        color: 'white',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '12px', color: '#ef4444' }}>Document Not Found</h2>
        <p style={{ color: '#94a3b8', marginBottom: '24px', maxWidth: '400px' }}>
          The reservation you are trying to print could not be retrieved from the server database.
        </p>
        <button 
          onClick={() => navigate('/bookings')}
          style={{
            padding: '12px 24px',
            backgroundColor: '#5BD51E',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Back to Bookings
        </button>
      </div>
    );
  }

  // Pre-calculated values based on editable state variables
  const totalAttendance = Number(gentsCount || 0) + Number(ladiesCount || 0);
  const subtotal = totalAttendance * Number(ratePerHead || 0);
  const overtimeAmount = Number(overtimeHours || 0) * 5000;
  const kitchenAmount = Number(kitchenCharge || 0);
  const decorationAmount = Number(decorationCharge || 0);
  const generatorAmount = Number(generatorCharge || 0);
  const extraServices = overtimeAmount + kitchenAmount + decorationAmount + generatorAmount;
  const inventoryTotal = inventoryBillLines.reduce(
    (sum, line) => (line.includeInBill ? sum + Number(line.price || 0) : sum),
    0
  );
  const chargedInventoryLines = inventoryBillLines.filter((line) => line.includeInBill);
  const totalBeforeTax = subtotal + extraServices + inventoryTotal;
  const taxRatePercent = 5;
  const taxAmount = totalBeforeTax * (taxRatePercent / 100);
  const grandTotal = totalBeforeTax + taxAmount;
  const remainingBalance = grandTotal - Number(advancePaid || 0);
  const showBillRow = (amount) => isEditable || Number(amount || 0) > 0;
  const fmt = (value) => Number(value || 0).toLocaleString();

  const handlePrint = () => {
    window.print();
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // Split customer name
      const nameParts = customerName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // 1. Update customer first
      await client.patch(`/customers/${booking.customer}/`, {
        first_name: firstName,
        last_name: lastName,
        phone: customerPhone,
        address: customerAddress
      });

      // 2. Update booking details
      const updatedBooking = await client.patch(`/bookings/${bookingId}/`, {
        event_name: eventName,
        venue_name: venueName,
        event_date: eventDate,
        slot: slot,
        gents_count: gentsCount,
        ladies_count: ladiesCount,
        rate_per_head: ratePerHead,
        overtime_hours: overtimeHours,
        kitchen_charge: kitchenCharge,
        decoration_charge: decorationCharge,
        generator_charge: generatorCharge,
        advance_paid: advancePaid,
        cnic: customerCnic
      });

      setBooking(updatedBooking.data);
      toast.success('Changes successfully saved to database!');
      setIsEditable(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save changes to database');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper helper to render plain text or borderless input when editable mode is on
  const renderInput = (value, onChange, type = 'text', options = {}) => {
    if (!isEditable) {
      return <span style={{ fontWeight: options.fontWeight || '600', color: '#0f172a' }}>{value}</span>;
    }
    return (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        style={{
          border: '1px solid #5BD51E',
          borderRadius: '4px',
          padding: '2px 6px',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          fontWeight: options.fontWeight || '600',
          color: '#0f172a',
          width: options.width || '100%',
          backgroundColor: '#f5fdf2',
          boxSizing: 'border-box',
          ...options.style
        }}
      />
    );
  };

  const renderSelect = (value, onChange, choices) => {
    if (!isEditable) {
      return <span style={{ textTransform: 'capitalize', fontWeight: '600', color: '#0f172a' }}>{value}</span>;
    }
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: '1px solid #5BD51E',
          borderRadius: '4px',
          padding: '2px 6px',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          fontWeight: '600',
          color: '#0f172a',
          backgroundColor: '#f5fdf2'
        }}
      >
        {choices.map(c => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    );
  };

  const isUrdu = printLanguage === 'urdu';
  const slotLabel = slot === 'morning'
    ? (isUrdu ? 'صبح' : 'Morning')
    : slot === 'custom'
      ? (isUrdu ? 'کسٹم' : 'Custom')
      : (isUrdu ? 'شام' : 'Evening');
  const partyLeftLabel = activeDocType === 'operations_report'
    ? (isUrdu ? 'کسٹمر' : 'Customer')
    : (isUrdu ? 'بل وصول کنندہ' : 'Billed to');

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a', // Sleek Premium Dark Slate Background
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      paddingBottom: '60px',
      boxSizing: 'border-box'
    }}>
      {/* Print styles override */}
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 10mm; }
          body {
            background-color: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #non-printable-toolbar {
            display: none !important;
          }
          #non-printable-sig-panel {
            display: none !important;
          }
          #printable-document-container {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            min-height: auto !important;
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .printable-card {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          input, select, textarea {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            color: black !important;
            font-weight: inherit !important;
            appearance: none !important;
            -webkit-appearance: none !important;
            outline: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* Floating Glass Toolbar */}
      <div id="non-printable-toolbar" className="print-doc-toolbar">
        <button
          type="button"
          className="print-doc-toolbar__back"
          onClick={() => navigate('/bookings')}
        >
          <ChevronLeft size={16} />
          Bookings
        </button>

        <div className="print-doc-toolbar__tabs">
          <div className="print-doc-toolbar__seg" role="tablist" aria-label="Document type">
            {(booking?.booking_status === 'CANCELLED'
              ? [
                  { id: 'cancellation_notice', label: 'Cancellation', icon: <XCircle size={14} /> },
                ]
              : [
                  { id: 'advance_receipt', label: 'Advance', icon: <Wallet size={14} /> },
                  { id: 'final_bill', label: 'Final Bill', icon: <FileText size={14} /> },
                  { id: 'operations_report', label: 'Logistics', icon: <Clock size={14} /> },
                ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeDocType === tab.id}
                className={`print-doc-toolbar__tab${activeDocType === tab.id ? ' is-active' : ''}`}
                onClick={() => setActiveDocType(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="print-doc-toolbar__actions">
          <div className="print-doc-toolbar__lang" role="group" aria-label="Print language">
            <button
              type="button"
              className={printLanguage === 'english' ? 'is-active' : ''}
              onClick={() => setPrintLanguage('english')}
            >
              EN
            </button>
            <button
              type="button"
              className={printLanguage === 'urdu' ? 'is-active' : ''}
              onClick={() => setPrintLanguage('urdu')}
            >
              اردو
            </button>
          </div>

          <button type="button" className="print-doc-toolbar__print" onClick={handlePrint}>
            <Printer size={16} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Flex Workspace Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: '28px',
        maxWidth: '1100px',
        margin: '24px auto 0 auto',
        padding: '0 16px',
        boxSizing: 'border-box'
      }}>
        
        {/* Left Side: A5 centered sheet layout */}
        <div id="printable-document-container" className="print-page-a5" style={{
          flex: '1',
          boxSizing: 'border-box'
        }}>
          
          <div className="printable-card pdoc">
            <header className="pdoc__header">
              <div className="pdoc__brand">
                <AppLogo size="sm" tone="dark" />
                <div className="pdoc__brand-text">
                  <h1>{BRAND_FULL_NAME}</h1>
                  <p>{isUrdu ? 'ویینیو مینجمنٹ' : 'Venue management'}</p>
                </div>
              </div>
              <div className="pdoc__docmeta">
                <div className="pdoc__docmeta-row">
                  <span>{isUrdu ? 'حوالہ' : 'Ref'}</span>
                  <strong>{booking.booking_id || `BK-${booking.id}`}</strong>
                </div>
                <div className="pdoc__docmeta-row">
                  <span>{isUrdu ? 'تاریخ' : 'Date'}</span>
                  <strong>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                </div>
              </div>
            </header>

            <div className="pdoc__parties">
              <div>
                <p className="pdoc__party-label">{partyLeftLabel}</p>
                <div className="pdoc__party-name">{renderInput(customerName, setCustomerName, 'text')}</div>
                <p className="pdoc__party-line">{renderInput(customerPhone, setCustomerPhone)}</p>
                <p className="pdoc__party-line">{isUrdu ? 'شناختی کارڈ' : 'CNIC'}: {renderInput(customerCnic, setCustomerCnic)}</p>
                {customerAddress ? <p className="pdoc__party-line">{renderInput(customerAddress, setCustomerAddress)}</p> : null}
              </div>
              <div>
                <p className="pdoc__party-label">{isUrdu ? 'تقریب' : 'Event'}</p>
                <div className="pdoc__party-name">{renderInput(eventName, setEventName, 'text')}</div>
                <div className="pdoc__party-grid">
                  <span>{isUrdu ? 'ہال' : 'Venue'}</span>
                  <strong>{renderInput(venueName, setVenueName)}</strong>
                  <span>{isUrdu ? 'تاریخ' : 'Date'}</span>
                  <strong>{renderInput(eventDate, setEventDate, 'date')}</strong>
                  <span>{isUrdu ? 'وقت' : 'Slot'}</span>
                  <strong>
                    {renderSelect(slot, setSlot, [
                      { value: 'morning', label: isUrdu ? 'صبح' : 'Morning' },
                      { value: 'evening', label: isUrdu ? 'شام' : 'Evening' },
                      { value: 'custom', label: isUrdu ? 'کسٹم' : 'Custom' },
                    ])}
                  </strong>
                </div>
              </div>
            </div>

            {/* ACTIVE TEMPLATE VIEWS */}
            
            {/* Tab 1: Advance Receipt View */}
            {activeDocType === 'advance_receipt' && (
              <div className="pbill">
                <div className="pbill-advance">
                  <span className="pbill-advance__label">
                    {isUrdu ? 'ایڈوانس رقم' : 'Advance Amount Received'}
                  </span>
                  <p className="pbill-advance__amount">
                    PKR {isEditable
                      ? renderInput(advancePaid, setAdvancePaid, 'number', { style: { textAlign: 'center', maxWidth: '180px' } })
                      : fmt(advancePaid)}
                  </p>
                  <span className="pbill-advance__badge">
                    {isUrdu ? 'ڈپازٹ محفوظ' : 'SECURED DEPOSIT'}
                  </span>
                </div>

                <div className="pbill-summary">
                  <div className="pbill-summary__row">
                    <span>{isUrdu ? 'اندازاً کل بل' : 'Estimated grand total'}</span>
                    <strong>PKR {fmt(grandTotal)}</strong>
                  </div>
                  <div className="pbill-summary__row">
                    <span>{isUrdu ? 'ادا شدہ ایڈوانس' : 'Advance paid'}</span>
                    <strong>PKR {fmt(advancePaid)}</strong>
                  </div>
                  <div className="pbill-summary__row">
                    <span>{isUrdu ? 'باقی رقم' : 'Balance remaining'}</span>
                    <strong>{formatCollectDuePKR(remainingBalance)}</strong>
                  </div>
                </div>

                <div className="pbill-terms">
                  <h5>{isUrdu ? 'شرائط' : 'Terms'}</h5>
                  <ol>
                    <li>
                      {isUrdu
                        ? `ایڈوانس PKR ${fmt(advancePaid)} ہال سلاٹ محفوظ کرتا ہے۔`
                        : `Advance of PKR ${fmt(advancePaid)} reserves this venue slot.`}
                    </li>
                    <li>
                      {isUrdu
                        ? `باقی رقم ${formatCollectDuePKR(remainingBalance)} ایونٹ سے کم از کم 24 گھنٹے پہلے ادا کرنی ہوگی۔`
                        : `Outstanding balance ${formatCollectDuePKR(remainingBalance)} is due at least 24 hours before the event.`}
                    </li>
                    <li>
                      {isUrdu
                        ? 'ایونٹ سے 14 دن سے کم پہلے منسوخی پر ایڈوانس قابلِ واپسی نہیں۔'
                        : 'Cancellations within 14 days of the event forfeit the advance deposit.'}
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {/* Tab 2: Event Final Bill View */}
            {activeDocType === 'final_bill' && (
              <div className="pbill">
                <table className="pbill__table">
                  <thead>
                    <tr>
                      <th style={{ width: '46%' }}>{isUrdu ? 'تفصیل' : 'Description'}</th>
                      <th className="pbill__num" style={{ width: '14%' }}>{isUrdu ? 'مقدار' : 'Qty'}</th>
                      <th className="pbill__num" style={{ width: '18%' }}>{isUrdu ? 'ریٹ' : 'Rate'}</th>
                      <th className="pbill__num" style={{ width: '22%' }}>{isUrdu ? 'رقم' : 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <span className="pbill__item">{isUrdu ? 'ہال بکنگ' : 'Hall booking'}</span>
                        <span className="pbill__meta">
                          {isUrdu ? 'مہمان' : 'Guests'}: {renderInput(gentsCount, setGentsCount, 'number', { width: '44px' })} {isUrdu ? 'مرد' : 'M'}
                          {' + '}
                          {renderInput(ladiesCount, setLadiesCount, 'number', { width: '44px' })} {isUrdu ? 'خواتین' : 'F'}
                        </span>
                      </td>
                      <td className="pbill__num">{fmt(totalAttendance)}</td>
                      <td className="pbill__num">{renderInput(ratePerHead, setRatePerHead, 'number', { width: '70px', textAlign: 'right' })}</td>
                      <td className="pbill__num">{fmt(subtotal)}</td>
                    </tr>

                    {showBillRow(overtimeAmount) && (
                      <tr>
                        <td>
                          <span className="pbill__item">{isUrdu ? 'اوور ٹائم' : 'Overtime'}</span>
                          <span className="pbill__meta">{isUrdu ? 'فی گھنٹہ' : 'Per extra hour'}</span>
                        </td>
                        <td className="pbill__num">{renderInput(overtimeHours, setOvertimeHours, 'number', { width: '44px', textAlign: 'right' })}</td>
                        <td className="pbill__num">5,000</td>
                        <td className="pbill__num">{fmt(overtimeAmount)}</td>
                      </tr>
                    )}

                    {showBillRow(kitchenAmount) && (
                      <tr>
                        <td>
                          <span className="pbill__item">{isUrdu ? 'کچن / دیگ' : 'Kitchen / Deg setup'}</span>
                          <span className="pbill__meta">{isUrdu ? 'کیٹرنگ سہولت' : 'Catering facility charge'}</span>
                        </td>
                        <td className="pbill__num">1</td>
                        <td className="pbill__num">{renderInput(kitchenCharge, setKitchenCharge, 'number', { width: '80px', textAlign: 'right' })}</td>
                        <td className="pbill__num">{fmt(kitchenAmount)}</td>
                      </tr>
                    )}

                    {showBillRow(decorationAmount) && (
                      <tr>
                        <td>
                          <span className="pbill__item">{isUrdu ? 'ڈیکوریشن' : 'Decoration'}</span>
                          <span className="pbill__meta">{isUrdu ? 'تھیم اور سجاوٹ' : 'Theme & setup charge'}</span>
                        </td>
                        <td className="pbill__num">1</td>
                        <td className="pbill__num">{renderInput(decorationCharge, setDecorationCharge, 'number', { width: '80px', textAlign: 'right' })}</td>
                        <td className="pbill__num">{fmt(decorationAmount)}</td>
                      </tr>
                    )}

                    {showBillRow(generatorAmount) && (
                      <tr>
                        <td>
                          <span className="pbill__item">{isUrdu ? 'جنریٹر' : 'Generator'}</span>
                          <span className="pbill__meta">{isUrdu ? 'بجلی بیک اپ' : 'Power backup charge'}</span>
                        </td>
                        <td className="pbill__num">1</td>
                        <td className="pbill__num">{renderInput(generatorCharge, setGeneratorCharge, 'number', { width: '80px', textAlign: 'right' })}</td>
                        <td className="pbill__num">{fmt(generatorAmount)}</td>
                      </tr>
                    )}

                    {chargedInventoryLines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <span className="pbill__item">{line.name}</span>
                          <span className="pbill__meta">{isUrdu ? 'انوینٹری آئٹم' : 'Inventory add-on'}</span>
                        </td>
                        <td className="pbill__num">{fmt(line.quantity)}</td>
                        <td className="pbill__num">{fmt(line.unitPrice)}</td>
                        <td className="pbill__num">{fmt(line.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="pbill__totals">
                  <div className="pbill__totals-row">
                    <span>{isUrdu ? 'سب ٹوٹل' : 'Subtotal'}</span>
                    <strong>{fmt(totalBeforeTax)}</strong>
                  </div>
                  <div className="pbill__totals-row">
                    <span>{isUrdu ? `ٹیکس (${taxRatePercent}%)` : `Tax (${taxRatePercent}%)`}</span>
                    <strong>{fmt(taxAmount)}</strong>
                  </div>
                  <div className="pbill__totals-row pbill__totals-row--grand">
                    <span>{isUrdu ? 'کل رقم' : 'Grand total'}</span>
                    <strong>PKR {fmt(grandTotal)}</strong>
                  </div>
                  <div className="pbill__totals-row">
                    <span>{isUrdu ? 'ایڈوانس وصول' : 'Advance received'}</span>
                    <strong>PKR {isEditable
                      ? renderInput(advancePaid, setAdvancePaid, 'number', { width: '90px', textAlign: 'right' })
                      : fmt(advancePaid)}</strong>
                  </div>
                  <div className={`pbill__totals-row pbill__totals-row--due${remainingBalance <= 0 ? ' is-cleared' : ''}`}>
                    <span>{remainingBalance <= 0
                      ? (isUrdu ? 'بل صاف' : 'Balance cleared')
                      : (isUrdu ? 'باقی رقم' : 'Balance due')}</span>
                    <strong>{formatCollectDuePKR(remainingBalance)}</strong>
                  </div>
                </div>
              </div>
            )}

            {activeDocType === 'cancellation_notice' && (
              <div style={{ marginTop: '20px' }}>
                <div style={{
                  textAlign: 'center',
                  padding: '28px 24px',
                  marginBottom: '32px',
                  borderRadius: '12px',
                  border: '2px solid #fecaca',
                  backgroundColor: '#fef2f2',
                }}>
                  <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#991b1b', margin: '0 0 8px 0', letterSpacing: '0.08em' }}>
                    {isUrdu ? 'بکنگ منسوخ' : 'BOOKING CANCELLED'}
                  </h2>
                  <p style={{ fontSize: '14px', color: '#7f1d1d', margin: 0, fontWeight: '600' }}>
                    {isUrdu ? 'یہ بکنگ مکمل طور پر منسوخ کر دی گئی ہے' : 'This reservation has been officially cancelled and is no longer valid.'}
                  </p>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px', fontSize: '14px', lineHeight: 1.7 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>{isUrdu ? 'بکنگ نمبر' : 'Booking reference'}</p>
                      <p style={{ margin: 0, fontWeight: '800', color: '#0f172a' }}>{booking.booking_id || `BK-${booking.id}`}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>{isUrdu ? 'منسوخی کی تاریخ' : 'Cancelled on'}</p>
                      <p style={{ margin: 0, fontWeight: '800', color: '#0f172a' }}>
                        {booking.cancelled_at
                          ? new Date(booking.cancelled_at).toLocaleString()
                          : new Date().toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>{isUrdu ? 'تقریب' : 'Event'}</p>
                      <p style={{ margin: 0, fontWeight: '700' }}>{eventName}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>{isUrdu ? 'تاریخ / وقت' : 'Event date / slot'}</p>
                      <p style={{ margin: 0, fontWeight: '700' }}>{eventDate || '-'} · {slot === 'morning' ? (isUrdu ? 'صبح' : 'Morning') : (isUrdu ? 'شام' : 'Evening')}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>{isUrdu ? 'ہال' : 'Venue'}</p>
                      <p style={{ margin: 0, fontWeight: '700' }}>{venueName}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>{isUrdu ? 'کسٹمر' : 'Customer'}</p>
                      <p style={{ margin: 0, fontWeight: '700' }}>{customerName}</p>
                    </div>
                  </div>

                  {booking.cancellation_reason && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>{isUrdu ? 'منسوخی کی وجہ' : 'Reason for cancellation'}</p>
                      <p style={{ margin: 0, color: '#475569', fontWeight: '600' }}>{booking.cancellation_reason}</p>
                    </div>
                  )}
                </div>

                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px 24px',
                  marginBottom: '24px',
                }}>
                  <p style={{ margin: '0 0 12px', fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>
                    {isUrdu ? 'ادائیگی کی تفصیل' : 'Payment summary'}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                    <span style={{ color: '#64748b' }}>{isUrdu ? 'کل رقم (منسوخ شدہ)' : 'Original contract total'}</span>
                    <span style={{ fontWeight: '700' }}>PKR {grandTotal.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                    <span style={{ color: '#64748b' }}>{isUrdu ? 'ادا شدہ ایڈوانس' : 'Advance received'}</span>
                    <span style={{ fontWeight: '700', color: '#166534' }}>PKR {Number(advancePaid).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
                    <span style={{ color: '#64748b', fontWeight: '700' }}>{isUrdu ? 'باقی واجب الادا (اب)' : 'Balance due (now)'}</span>
                    <span style={{ fontWeight: '900', color: '#15803d' }}>PKR 0</span>
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 24px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 8px', fontWeight: '800', color: '#0f172a' }}>{isUrdu ? 'اہم نوٹ' : 'Important notice'}</p>
                  <ul style={{ margin: 0, paddingLeft: '18px' }}>
                    <li style={{ marginBottom: '6px' }}>{isUrdu ? 'ہال کی بکنگ ختم - یہ تاریخ اب دوسرے کسٹمر کے لیے دستیاب ہے۔' : 'The hall slot has been released and is available for other bookings.'}</li>
                    <li style={{ marginBottom: '6px' }}>{isUrdu ? 'کوئی باقی واجب الادا رقم نہیں - بکنگ مکمل طور پر منسوخ۔' : 'No further payment is due on this cancelled reservation.'}</li>
                    <li>{isUrdu ? 'ایڈوانس رقم کی واپسی کی صورت میں الگ رسید جاری کی جائے گی۔' : 'If advance was refunded, a separate refund receipt will be issued by management.'}</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Tab 3: Operations Setup & Logistics View */}
            {activeDocType === 'operations_report' && (
              <div className="plog">
                <div className="plog__grid">
                  <div className="plog__card">
                    <h4>{isUrdu ? 'مہمان / ہال' : 'Guests / Hall'}</h4>
                    <div className="plog__row">
                      <span>{isUrdu ? 'گنجائش' : 'Capacity'}</span>
                      <strong>{venue?.capacity || booking.venue_capacity || '—'} {isUrdu ? 'نشستیں' : 'seats'}</strong>
                    </div>
                    <div className="plog__row">
                      <span>{isUrdu ? 'کل مہمان' : 'Total guests'}</span>
                      <strong>{fmt(totalAttendance)}</strong>
                    </div>
                    <div className="plog__row">
                      <span>{isUrdu ? 'مرد' : 'Gents'}</span>
                      <strong>{renderInput(gentsCount, setGentsCount, 'number', { width: '56px', textAlign: 'right' })}</strong>
                    </div>
                    <div className="plog__row">
                      <span>{isUrdu ? 'خواتین' : 'Ladies'}</span>
                      <strong>{renderInput(ladiesCount, setLadiesCount, 'number', { width: '56px', textAlign: 'right' })}</strong>
                    </div>
                    <div className="plog__row">
                      <span>{isUrdu ? 'سلاٹ' : 'Slot'}</span>
                      <strong>{slotLabel}</strong>
                    </div>
                  </div>

                  <div className="plog__card">
                    <h4>{isUrdu ? 'سروسز' : 'Services'}</h4>
                    <div className="plog__row">
                      <span>{isUrdu ? 'کچن' : 'Kitchen'}</span>
                      <strong>{kitchenAmount > 0 ? `PKR ${fmt(kitchenAmount)}` : (isUrdu ? 'نہیں' : 'No')}</strong>
                    </div>
                    <div className="plog__row">
                      <span>{isUrdu ? 'ڈیکوریشن' : 'Decoration'}</span>
                      <strong>{decorationAmount > 0 ? `PKR ${fmt(decorationAmount)}` : (isUrdu ? 'نہیں' : 'No')}</strong>
                    </div>
                    <div className="plog__row">
                      <span>{isUrdu ? 'جنریٹر' : 'Generator'}</span>
                      <strong>{generatorAmount > 0 ? `PKR ${fmt(generatorAmount)}` : (isUrdu ? 'نہیں' : 'No')}</strong>
                    </div>
                    <div className="plog__row">
                      <span>{isUrdu ? 'اوور ٹائم' : 'Overtime'}</span>
                      <strong>{Number(overtimeHours) > 0 ? `${fmt(overtimeHours)} ${isUrdu ? 'گھنٹے' : 'hrs'}` : (isUrdu ? 'نہیں' : 'No')}</strong>
                    </div>
                    <div className="plog__row">
                      <span>{isUrdu ? 'ایڈوانس' : 'Advance'}</span>
                      <strong>PKR {fmt(advancePaid)}</strong>
                    </div>
                  </div>
                </div>

                {inventoryBillLines.length > 0 && (
                  <div className="plog__card">
                    <h4>{isUrdu ? 'انوینٹری آئٹمز' : 'Inventory items'}</h4>
                    {inventoryBillLines.map((line) => (
                      <div className="plog__row" key={line.id}>
                        <span>{line.name}{line.includeInBill ? '' : (isUrdu ? ' (بلا چارج)' : ' (no charge)')}</span>
                        <strong>× {fmt(line.quantity)}</strong>
                      </div>
                    ))}
                  </div>
                )}

                <div className="plog__card">
                  <h4>{isUrdu ? 'چیک لسٹ' : 'Checklist'}</h4>
                  <ul className="plog__list">
                    <li>{isUrdu ? 'ہال صفائی اور سٹیج تیار' : 'Hall cleaning and stage ready'}</li>
                    <li>{isUrdu ? 'لائٹنگ / آڈیو چیک' : 'Lighting / audio check'}</li>
                    <li>{isUrdu ? 'مہمان سیٹنگ مرد / خواتین کے مطابق' : 'Seating set for gents / ladies counts'}</li>
                    {generatorAmount > 0 && (
                      <li>{isUrdu ? 'جنریٹر بیک اپ چیک' : 'Generator backup checked'}</li>
                    )}
                    {inventoryBillLines.length > 0 && (
                      <li>{isUrdu ? 'انوینٹری آئٹمز ایونٹ سے پہلے تیار' : 'Inventory items staged before event'}</li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            <div className="pdoc__sigs">
              <div className="pdoc__sig">
                <div className="pdoc__sig-line">
                  {officerSig ? <img src={officerSig} alt="Officer signature" /> : null}
                </div>
                <strong>{isUrdu ? 'آفیسر دستخط' : 'Officer signature'}</strong>
                <span>{isUrdu ? 'مینجمنٹ' : 'Management'}</span>
              </div>
              <div className="pdoc__sig">
                <div className="pdoc__sig-line">
                  {customerSig ? <img src={customerSig} alt="Customer signature" /> : null}
                </div>
                <strong>{isUrdu ? 'کسٹمر دستخط' : 'Customer signature'}</strong>
                <span>{isUrdu ? 'کلائنٹ' : 'Client'}</span>
              </div>
            </div>

          </div>

        </div>

        {/* Right Side: Sticky Digital Signature Pad & Edit Control Panel */}
        <div id="non-printable-sig-panel" style={{
          width: '320px',
          position: 'sticky',
          top: '100px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
          boxSizing: 'border-box'
        }}>
          
          {/* Editable Control section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
            <div style={{ backgroundColor: isEditable ? 'rgba(91, 213, 30, 0.15)' : 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Edit size={16} color={isEditable ? '#5BD51E' : '#94a3b8'} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'white', margin: 0 }}>Editable Mode</h3>
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>پرنٹ ایڈیٹ پینل</p>
            </div>
            
            {/* Toggle switch */}
            <button 
              onClick={() => setIsEditable(!isEditable)}
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: '700',
                backgroundColor: isEditable ? '#5BD51E' : 'rgba(255,255,255,0.05)',
                color: 'white',
                border: '1px solid ' + (isEditable ? '#5BD51E' : 'rgba(255,255,255,0.1)'),
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {isEditable ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Save Changes Button if edited */}
          {isEditable && (
            <button 
              onClick={handleSaveChanges}
              disabled={isSaving}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                backgroundColor: '#166534',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '12px',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                marginBottom: '20px',
                transition: 'all 0.2s',
                opacity: isSaving ? 0.6 : 1
              }}
              onMouseEnter={(e) => { if(!isSaving) e.currentTarget.style.backgroundColor = '#15803d'; }}
              onMouseLeave={(e) => { if(!isSaving) e.currentTarget.style.backgroundColor = '#166534'; }}
            >
              <Save size={16} /> {isSaving ? 'Saving to Database...' : 'Save to Database'}
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <div style={{ backgroundColor: 'rgba(91, 213, 30, 0.1)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={16} color="#5BD51E" />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'white', margin: 0 }}>Signature Station</h3>
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>دستخط کا ڈیجیٹل پینل</p>
            </div>
          </div>
          
          <p style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: '1.5', marginBottom: '20px' }}>
            Draw directly inside the pads below. Signatures sync onto the A5 sheet.
          </p>

          {/* Canvas Signature Pad 1: Officer */}
          <SignaturePad 
            label="1. Authorized Officer" 
            subtitle="انتظامی دستخط"
            onSave={(dataUrl) => setOfficerSig(dataUrl)}
          />

          {/* Canvas Signature Pad 2: Customer */}
          <SignaturePad 
            label="2. Customer Signature" 
            subtitle="گاہک کے دستخط"
            onSave={(dataUrl) => setCustomerSig(dataUrl)}
          />

          <div style={{ 
            marginTop: '20px', 
            padding: '12px', 
            borderRadius: '10px', 
            backgroundColor: 'rgba(91, 213, 30, 0.05)', 
            border: '1px solid rgba(91, 213, 30, 0.1)',
            fontSize: '10px',
            color: '#5BD51E',
            lineHeight: '1.4',
            textAlign: 'center',
            fontWeight: '600'
          }}>
            ✍️ Touchscreen tablets or mobile screens can be used to sign directly with a finger or stylus.
          </div>
        </div>

      </div>
    </div>
  );
};

export default PrintDocument;
