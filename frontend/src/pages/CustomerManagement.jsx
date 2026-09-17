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
  MapPin,
  ChevronRight,
  FileText,
} from 'lucide-react';
import client from '../api/client';
import toast from 'react-hot-toast';
import { customerDisplayName, buildCustomerPayload } from '../utils/customer';
import { cnicDigits } from '../utils/cnicScanner';
import {
  formatCollectDue,
  bookingCollectDue,
  hasCollectDue,
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
  return {
    customer,
    bookings,
    bookings_count: bookings.length,
    total_outstanding: outstanding,
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

  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState({
    full_name: '',
    cnic: '',
    email: '',
    phone: '',
    address: '',
  });

  const uniqueList = useMemo(() => uniqueCustomers(customers), [customers]);

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

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return uniqueList;
    return uniqueList.filter((c) => {
      const name = customerDisplayName(c).toLowerCase();
      return (
        name.includes(q) ||
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

  const selectedCustomer = summary?.customer
    || uniqueList.find((c) => c.id === selectedId || (c._ids || []).includes(selectedId));

  return (
    <>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Click a customer to view profile, events, and balance due.</p>
          </div>
        </div>

        <div className={`split-layout ${selectedId ? 'split-layout--customers' : ''}`}>
          <div>
            <div className="card customers-table-card" style={{ padding: 0, overflow: 'hidden' }}>
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
                  toolbarStart={(
                    <SearchInput
                      id="customers-list-search"
                      className="customers-table-search"
                      placeholder="Search name, phone, CNIC..."
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
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Customer detail</p>
                    </div>
                    <button type="button" onClick={() => navigate('/customers')} style={{ padding: '8px', color: 'var(--text-muted)', background: 'transparent' }} title="Close">
                      <X size={18} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)' }}>
                      <Phone size={16} /> {selectedCustomer.phone}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-muted)' }}>
                      <Mail size={16} /> {selectedCustomer.email || '—'}
                    </div>
                    {selectedCustomer.cnic && (
                      <div style={{ gridColumn: 'span 2', fontFamily: 'monospace', fontSize: '13px' }}>CNIC: {selectedCustomer.cnic}</div>
                    )}
                    {selectedCustomer.address && (
                      <div style={{ gridColumn: 'span 2', display: 'flex', gap: '8px', color: 'var(--text-muted)' }}>
                        <MapPin size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {selectedCustomer.address}
                      </div>
                    )}
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
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Total events</p>
                      <p style={{ fontSize: '22px', fontWeight: '800', marginTop: '4px' }}>{summary?.bookings_count ?? 0}</p>
                    </div>
                    <div className="premium-card" style={{ padding: '16px', borderColor: hasCollectDue(summary?.total_outstanding) ? '#fecaca' : undefined }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Balance due</p>
                      <p style={{ fontSize: '22px', fontWeight: '800', marginTop: '4px', color: hasCollectDue(summary?.total_outstanding) ? '#b91c1c' : 'var(--text-dim)' }}>
                        {formatCollectDue(summary?.total_outstanding)}
                      </p>
                    </div>
                  </div>

                  <h4 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} /> Events
                  </h4>

                  {!summary?.bookings?.length ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                      <p style={{ margin: 0 }}>No events for this customer yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto' }}>
                      {summary.bookings.map((b) => {
                        const remaining = bookingCollectDue(b);
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
                            }}
                          >
                            <p style={{ fontWeight: '700', fontSize: '15px' }}>{b.event_name}</p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {b.venue_name} · {b.event_date || '—'} · {b.slot || '—'}
                            </p>
                            <p style={{ fontSize: '13px', fontWeight: '700', marginTop: '8px', color: hasCollectDue(remaining) ? '#b91c1c' : 'var(--text-dim)' }}>
                              Due {formatCollectDue(remaining)}
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
    </>
  );
};

export default CustomerManagement;
