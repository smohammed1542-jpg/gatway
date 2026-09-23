import { useState, useEffect, useCallback, useMemo } from 'react';
import SearchInput from '../components/SearchInput';
import AppLoader from '../components/AppLoader';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  UserPlus,
  Mail,
  Phone,
  Edit2,
  Archive,
  Trash2,
  X,
  MapPin,
  FileText,
  ChevronLeft,
} from 'lucide-react';
import client from '../api/client';
import toast from 'react-hot-toast';
import { customerDisplayName, customerCode, buildCustomerPayload } from '../utils/customer';
import { cnicDigits } from '../utils/cnicScanner';
import {
  formatCollectDue,
  formatRs,
  bookingCollectDue,
  hasCollectDue,
  parseAmount,
} from '../utils/currency';
import { usePermissions } from '../hooks/usePermissions';
import DataTable from '../components/ui/DataTable';
import useEscapeClose from '../hooks/useEscapeClose';

function phoneKey(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

/** Same CNIC or same phone = one customer row. Minors stay separate. */
function uniqueCustomers(list) {
  const items = Array.isArray(list) ? list : [];
  const parent = items.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };

  const byCnic = new Map();
  const byPhone = new Map();
  items.forEach((customer, index) => {
    if (customer?.is_minor) return;
    const cnic = cnicDigits(customer?.cnic);
    const phone = phoneKey(customer?.phone);
    if (cnic.length >= 13) {
      if (byCnic.has(cnic)) union(byCnic.get(cnic), index);
      else byCnic.set(cnic, index);
    }
    if (phone) {
      if (byPhone.has(phone)) union(byPhone.get(phone), index);
      else byPhone.set(phone, index);
    }
  });

  const groups = new Map();
  items.forEach((customer, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(customer);
  });

  return [...groups.values()].map((group) => {
    const kept = group[0];
    return {
      ...kept,
      outstanding_balance: group.reduce((sum, row) => sum + Number(row.outstanding_balance || 0), 0),
      _ids: group.map((row) => row.id),
    };
  });
}

function customerRecordIds(customer, fallbackId) {
  if (customer?._ids?.length) return customer._ids;
  if (customer?.id) return [customer.id];
  return fallbackId ? [fallbackId] : [];
}

function formatClock(value) {
  const raw = String(value || '').slice(0, 8);
  if (!raw) return '';
  const [hStr, mStr] = raw.split(':');
  const hour = Number(hStr);
  const minute = Number(mStr || 0);
  if (!Number.isFinite(hour)) return raw;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function bookingTimeLabel(booking) {
  const slot = String(booking.slot || '').toLowerCase();
  if (slot === 'morning') return '9am – 3pm';
  if (slot === 'evening') return '6pm – 12am';
  if (slot === 'custom') {
    const start = formatClock(booking.custom_start_time);
    const end = formatClock(booking.custom_end_time);
    if (start && end) return `${start} – ${end}`;
    return 'Custom';
  }
  return booking.slot || '—';
}

function bookingEventId(booking) {
  return booking.booking_id || (booking.id != null ? `BK-${booking.id}` : '—');
}

function bookingHasMoney(booking) {
  return parseAmount(booking.advance_paid) > 0
    || parseAmount(booking.total_price) > 0
    || parseAmount(booking.remaining_balance) > 0;
}

function mergeSummaries(results, preferredId) {
  const bookingsById = new Map();
  let outstanding = 0;
  let customer = null;
  results.forEach((data) => {
    if (!data) return;
    outstanding += Number(data.total_outstanding || 0);
    if (!customer || data.customer?.id === preferredId) {
      customer = data.customer || customer;
    }
    (data.bookings || []).forEach((booking) => {
      if (booking?.id != null) bookingsById.set(booking.id, booking);
    });
  });
  const bookings = [...bookingsById.values()].sort((a, b) => (
    String(b.event_date || '').localeCompare(String(a.event_date || ''))
  ));
  const hasMoney = results.some((data) => data?.has_monetary_transactions)
    || bookings.some(bookingHasMoney);
  return {
    customer,
    bookings,
    bookings_count: bookings.length,
    total_outstanding: outstanding,
    has_monetary_transactions: hasMoney,
  };
}

const CustomerManagement = () => {
  const { canManage } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const { customerId: customerIdParam } = useParams();
  const selectedId = customerIdParam ? Number(customerIdParam) : null;
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [eventDateFrom, setEventDateFrom] = useState('');
  const [eventDateTo, setEventDateTo] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventVenue, setEventVenue] = useState('');
  const [eventBill, setEventBill] = useState('all');

  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState({
    full_name: '',
    cnic: '',
    email: '',
    phone: '',
    address: '',
  });

  const uniqueList = useMemo(
    () => uniqueCustomers(customers).filter((row) => !row.is_archived),
    [customers],
  );

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

  const fetchSummary = useCallback(async (customerId, groupedCustomers) => {
    if (!customerId) return;
    setSummaryLoading(true);
    try {
      const group = (groupedCustomers || []).find(
        (row) => row.id === customerId || (row._ids || []).includes(customerId),
      );
      const ids = group?._ids?.length ? group._ids : [customerId];
      const responses = await Promise.all(
        ids.map((id) => client.get(`/customers/${id}/summary/`)),
      );
      setSummary(mergeSummaries(responses.map((res) => res.data), customerId));
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
    const onKeyDown = (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = String(target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
      if (typing) return;
      event.preventDefault();
      document.getElementById('customers-list-search')?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
    if (!selectedId) {
      setSummary(null);
      return;
    }
    if (isLoading) return;
    fetchSummary(selectedId, uniqueList);
  }, [selectedId, fetchSummary, uniqueList, isLoading]);

  useEffect(() => {
    setEventDateFrom('');
    setEventDateTo('');
    setEventType('');
    setEventVenue('');
    setEventBill('all');
  }, [selectedId]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return uniqueList;
    return uniqueList.filter((c) => {
      const name = customerDisplayName(c).toLowerCase();
      return (
        name.includes(q) ||
        customerCode(c).toLowerCase().includes(q) ||
        String(c.customer_code || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.cnic || '').includes(q)
      );
    });
  }, [uniqueList, searchQuery]);

  const handleSelectCustomer = (customer) => {
    navigate(`/customers/${customer.id}`);
  };

  useEscapeClose(showFormModal, () => setShowFormModal(false));
  useEscapeClose(Boolean(selectedId) && !showFormModal, () => navigate('/customers'));

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
    const newCnic = cnicDigits(payload.cnic);
    const newPhone = phoneKey(payload.phone);
    const duplicate = uniqueList.find((row) => {
      if (isEditing && (row.id === currentCustomer.id || (row._ids || []).includes(currentCustomer.id))) {
        return false;
      }
      const sameCnic = newCnic.length >= 13 && cnicDigits(row.cnic) === newCnic;
      const samePhone = newPhone && phoneKey(row.phone) === newPhone;
      return sameCnic || samePhone;
    });
    if (!isEditing && duplicate) {
      toast.error('This customer already exists');
      setShowFormModal(false);
      navigate(`/customers/${duplicate.id}`);
      return;
    }
    try {
      if (isEditing) {
        await client.put(`/customers/${currentCustomer.id}/`, payload);
        toast.success('Customer updated');
        if (selectedId === currentCustomer.id) fetchSummary(selectedId, uniqueList);
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

  const handleArchive = async (customer) => {
    if (!canManage) return;
    if (!window.confirm('Archive this customer? They will be hidden from the list.')) return;
    const ids = customerRecordIds(customer, selectedId);
    try {
      await Promise.all(ids.map((id) => client.post(`/customers/${id}/archive/`)));
      toast.success('Customer archived');
      navigate('/customers');
      fetchCustomers();
    } catch {
      toast.error('Failed to archive customer');
    }
  };

  const handleDelete = async (customer) => {
    if (!canManage) return;
    if (!window.confirm('Delete this customer permanently? This cannot be undone.')) return;
    const ids = customerRecordIds(customer, selectedId);
    try {
      await Promise.all(ids.map((id) => client.delete(`/customers/${id}/`)));
      toast.success('Customer deleted');
      navigate('/customers');
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete customer');
    }
  };

  const openBookingDetailPage = (bookingId) => {
    navigate(`/bookings/${bookingId}`);
  };

  const selectedCustomer = summary?.customer
    || uniqueList.find((c) => c.id === selectedId || (c._ids || []).includes(selectedId));

  const hasMonetaryTransactions = Boolean(summary?.has_monetary_transactions)
    || (summary?.bookings || []).some(bookingHasMoney);

  const eventTypeOptions = useMemo(() => {
    const names = new Set();
    (summary?.bookings || []).forEach((booking) => {
      const name = String(booking.event_name || '').trim();
      if (name) names.add(name);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [summary?.bookings]);

  const eventVenueOptions = useMemo(() => {
    const names = new Set();
    (summary?.bookings || []).forEach((booking) => {
      const name = String(booking.venue_name || '').trim();
      if (name && name !== '—') names.add(name);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [summary?.bookings]);

  const filteredEvents = useMemo(() => {
    return (summary?.bookings || []).filter((booking) => {
      const date = String(booking.event_date || '');
      if (eventDateFrom && date && date < eventDateFrom) return false;
      if (eventDateTo && date && date > eventDateTo) return false;
      if (eventDateFrom && !date) return false;
      if (eventType && String(booking.event_name || '').trim() !== eventType) return false;
      if (eventVenue && String(booking.venue_name || '').trim() !== eventVenue) return false;
      const due = bookingCollectDue(booking);
      const settled = parseAmount(booking.advance_paid);
      if (eventBill === 'due' && due <= 0) return false;
      if (eventBill === 'settled' && (due > 0 || settled <= 0)) return false;
      return true;
    });
  }, [summary?.bookings, eventDateFrom, eventDateTo, eventType, eventVenue, eventBill]);

  return (
    <>
      <div className="animate-fade-in">
        {selectedId ? (
          <div className="customer-profile">
            {(isLoading || summaryLoading) && !selectedCustomer ? (
              <AppLoader inline message="Loading profile…" />
            ) : selectedCustomer ? (
              <>
                <div className="customer-profile__header">
                  <button type="button" className="customer-profile__back" onClick={() => navigate('/customers')}>
                    <ChevronLeft size={18} /> Customers
                  </button>
                  <div className="customer-profile__title-row">
                    <div>
                      <h3>{customerDisplayName(selectedCustomer)}</h3>
                      <p className="customer-profile__code">{customerCode(selectedCustomer)}</p>
                    </div>
                    {canManage && (
                      <div className="customer-profile__actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleOpenFormModal(selectedCustomer)}
                        >
                          <Edit2 size={15} /> Edit
                        </button>
                        {!hasMonetaryTransactions && (
                          <button
                            type="button"
                            className="btn-secondary customer-profile__delete"
                            onClick={() => handleDelete(selectedCustomer)}
                          >
                            <Trash2 size={15} /> Delete
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleArchive(selectedCustomer)}
                        >
                          <Archive size={15} /> Archive
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card customer-profile__details">
                  <div className="customer-profile__meta">
                    <div><Phone size={16} /> {selectedCustomer.phone || '—'}</div>
                    <div><Mail size={16} /> {selectedCustomer.email || '—'}</div>
                    {selectedCustomer.cnic ? (
                      <div className="customer-profile__cnic">CNIC: {selectedCustomer.cnic}</div>
                    ) : null}
                    {selectedCustomer.address ? (
                      <div className="customer-profile__address">
                        <MapPin size={16} /> {selectedCustomer.address}
                      </div>
                    ) : null}
                  </div>
                  <div className="customer-profile__stats">
                    <div className="premium-card">
                      <p>Total events</p>
                      <strong>{summary?.bookings_count ?? 0}</strong>
                    </div>
                    <div className={`premium-card${hasCollectDue(summary?.total_outstanding) ? ' customer-profile__due' : ''}`}>
                      <p>Balance due</p>
                      <strong>{formatCollectDue(summary?.total_outstanding)}</strong>
                    </div>
                  </div>
                </div>

                <div className="card customers-table-card customer-events-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="customer-events-heading">
                    <FileText size={16} /> Events
                  </div>
                  {summaryLoading ? (
                    <AppLoader inline message="Loading events…" />
                  ) : (
                    <DataTable
                    variant="erp"
                    sortable
                    showColumnChooser
                    pageSize={25}
                    emptyTitle="No events found"
                    emptyDescription={summary?.bookings?.length ? 'Try another date or filter.' : 'No events for this customer yet.'}
                    toolbarStart={(
                      <div className="customer-events-filters">
                        <label>
                          From
                          <input type="date" value={eventDateFrom} onChange={(e) => setEventDateFrom(e.target.value)} />
                        </label>
                        <label>
                          To
                          <input type="date" value={eventDateTo} onChange={(e) => setEventDateTo(e.target.value)} />
                        </label>
                        <select value={eventType} onChange={(e) => setEventType(e.target.value)} aria-label="Filter by type">
                          <option value="">All types</option>
                          {eventTypeOptions.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <select value={eventVenue} onChange={(e) => setEventVenue(e.target.value)} aria-label="Filter by venue">
                          <option value="">All venues</option>
                          {eventVenueOptions.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <select value={eventBill} onChange={(e) => setEventBill(e.target.value)} aria-label="Filter by bill">
                          <option value="all">All bills</option>
                          <option value="due">Has due</option>
                          <option value="settled">Settled</option>
                        </select>
                      </div>
                    )}
                    columns={[
                      { key: 'event_id', label: 'Event ID', width: '130px' },
                      { key: 'event_date', label: 'Date', width: '120px' },
                      { key: 'time', label: 'Time', width: '140px' },
                      { key: 'event_name', label: 'Type' },
                      { key: 'venue_name', label: 'Venue' },
                      { key: 'due', label: 'Due Amount', width: '120px' },
                      { key: 'settled', label: 'Settled Amount', width: '130px' },
                    ]}
                    data={filteredEvents}
                    onRowClick={(booking) => openBookingDetailPage(booking.id)}
                    getSortValue={(row, key) => {
                      if (key === 'event_id') return bookingEventId(row);
                      if (key === 'event_date') return String(row.event_date || '');
                      if (key === 'time') return bookingTimeLabel(row);
                      if (key === 'event_name') return String(row.event_name || '');
                      if (key === 'venue_name') return String(row.venue_name || '');
                      if (key === 'due') return bookingCollectDue(row);
                      if (key === 'settled') return parseAmount(row.advance_paid);
                      return row[key];
                    }}
                    renderCell={(booking, key) => {
                      if (key === 'event_id') {
                        return <span className="customer-events-id">{bookingEventId(booking)}</span>;
                      }
                      if (key === 'event_date') return booking.event_date || '—';
                      if (key === 'time') return bookingTimeLabel(booking);
                      if (key === 'event_name') return booking.event_name || '—';
                      if (key === 'venue_name') return booking.venue_name || '—';
                      if (key === 'due') {
                        const due = bookingCollectDue(booking);
                        return (
                          <span style={{ fontWeight: 700, color: hasCollectDue(due) ? '#b91c1c' : 'var(--text-dim)' }}>
                            {formatCollectDue(due)}
                          </span>
                        );
                      }
                      if (key === 'settled') {
                        return <span style={{ fontWeight: 700 }}>{formatRs(booking.advance_paid)}</span>;
                      }
                      return booking[key] || '—';
                    }}
                  />
                  )}
                </div>
              </>
            ) : (
              <div className="card" style={{ padding: 24 }}>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>Customer not found.</p>
                <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={() => navigate('/customers')}>
                  Back to customers
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="card customers-table-card" style={{ padding: 0, overflow: 'hidden' }}>
            {isLoading ? (
              <AppLoader inline message="Loading customers…" />
            ) : (
              <DataTable
                variant="erp"
                sortable
                showColumnChooser
                pageSize={25}
                emptyTitle="No customers found"
                emptyDescription="Try another search or add a customer."
                toolbarStart={(
                  <SearchInput
                    id="customers-list-search"
                    className="customers-table-search"
                    placeholder="Search ID, name, phone, CNIC..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-keyshortcuts="/"
                  />
                )}
                toolbarEnd={canManage ? (
                  <button type="button" className="btn-primary customers-toolbar-add" onClick={() => handleOpenFormModal()}>
                    <UserPlus size={16} /> Add Customer
                  </button>
                ) : null}
                columns={[
                  { key: 'customer_code', label: 'ID', width: '110px' },
                  { key: 'name', label: 'Customer' },
                  { key: 'phone', label: 'Phone', width: '130px' },
                  { key: 'cnic', label: 'CNIC', width: '140px' },
                  { key: 'outstanding_balance', label: 'Due', width: '110px' },
                ]}
                data={filteredCustomers}
                onRowClick={handleSelectCustomer}
                getSortValue={(row, key) => {
                  if (key === 'name') return customerDisplayName(row);
                  if (key === 'customer_code') return customerCode(row);
                  if (key === 'outstanding_balance') return Number(row.outstanding_balance || 0);
                  return row[key];
                }}
                renderCell={(customer, key) => {
                  if (key === 'customer_code') {
                    return <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{customerCode(customer)}</span>;
                  }
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
        )}
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
    </>
  );
};

export default CustomerManagement;
