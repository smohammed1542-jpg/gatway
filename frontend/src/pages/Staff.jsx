import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  UserPlus,
  Mail,
  X,
  Trash2,
  Edit2,
  ChevronRight,
  Shield,
  Calendar,
  Clock,
  Building2,
  Hash,
  User,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import client from '../api/client';
import toast from 'react-hot-toast';
import { resolveMediaUrl } from '../utils/media';
import { useAppType } from '../hooks/useAppType';
import './staff.css';
import DataTable from '../components/ui/DataTable';
import SearchInput from '../components/SearchInput';

const ROLE_COLORS = {
  ADMIN: { bg: '#fef3c7', color: '#92400e', label: 'Admin' },
  MANAGER: { bg: '#dbeafe', color: '#1e40af', label: 'Manager' },
  STAFF: { bg: '#dcfce7', color: '#166534', label: 'Staff' },
};

const ROLE_LOGIN_ACCESS = {
  ADMIN: 'Full access - dashboard, reports, expenses, staff, settings, and all bookings.',
  MANAGER: 'Manage bookings, payments, customers, rooms - no staff or settings access.',
  STAFF: 'Bookings and stays only - no payments, dashboard, reports, or settings.',
};

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const staffDisplayName = (member) =>
  `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email;

const staffInitials = (member) => {
  const fromName = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`;
  if (fromName) return fromName.toUpperCase();
  return (member.email?.[0] || '?').toUpperCase();
};

const StaffAvatar = ({ member, size = 52, active = false, fontSize }) => {
  const avatarUrl = resolveMediaUrl(member?.avatar);
  const radius = size >= 60 ? '16px' : '14px';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        backgroundColor: active ? 'var(--primary)' : 'var(--primary-light)',
        color: active ? 'white' : 'var(--primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: fontSize || (size >= 60 ? 22 : 18),
        overflow: 'hidden',
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={staffDisplayName(member)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        staffInitials(member)
      )}
    </div>
  );
};

const Staff = ({ embedded = false }) => {
  const { isGuestHouse } = useAppType();
  const portalLabel = isGuestHouse ? 'Guest House' : 'Marriage Hall';
  const [staff, setStaff] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    role: 'STAFF',
    phone: '',
    salary: '',
    joining_date: '',
    password: '',
    confirm_password: '',
    profile_status: true,
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchStaff = async () => {
    setIsLoading(true);
    try {
      const response = await client.get('/auth/staff/');
      const list = response.data.results || response.data || [];
      setStaff(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error('Failed to fetch staff');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStaffDetail = async (id) => {
    setDetailLoading(true);
    try {
      const response = await client.get(`/auth/staff/${id}/`);
      setSelectedMember(response.data);
    } catch (err) {
      toast.error('Failed to load staff details');
      setSelectedId(null);
      setSelectedMember(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  useEffect(() => {
    if (!showModal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [showModal]);

  useEffect(() => {
    if (selectedId) {
      fetchStaffDetail(selectedId);
    } else {
      setSelectedMember(null);
    }
  }, [selectedId]);

  const handleSelectStaff = (member) => {
    setSelectedId(member.id);
  };

  const filteredStaff = staff.filter((member) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      staffDisplayName(member).toLowerCase().includes(q)
      || (member.email || '').toLowerCase().includes(q)
      || (member.username || '').toLowerCase().includes(q)
      || (member.role || '').toLowerCase().includes(q)
    );
  });

  const openAddModal = () => {
    setEditingMember(null);
    setFormData({
      username: '', first_name: '', last_name: '', email: '', role: 'STAFF',
      phone: '', salary: '', joining_date: '', password: '', confirm_password: '',
      profile_status: true,
    });
    setShowCreatePassword(false);
    setShowModal(true);
  };

  const openEditModal = (member) => {
    setEditingMember(member);
    setFormData({
      username: member.username || '',
      first_name: member.first_name || '',
      last_name: member.last_name || '',
      email: member.email || '',
      role: member.role || 'STAFF',
      phone: member.phone || '',
      salary: member.salary ?? '',
      joining_date: member.joining_date || '',
      profile_status: member.profile_status !== false,
    });
    setShowModal(true);
  };

  const handleResetPassword = async () => {
    if (!selectedMember || resetPassword.length < 8) {
      toast.error('Enter a new password (min 8 characters)');
      return;
    }
    try {
      await client.post(`/auth/staff/${selectedMember.id}/reset-password/`, { new_password: resetPassword });
      toast.success('Password reset successfully');
      setResetPassword('');
    } catch (err) {
      toast.error(err.response?.data?.new_password?.[0] || 'Failed to reset password');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!editingMember) {
      if (formData.password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
      if (formData.password !== formData.confirm_password) {
        toast.error('Password and confirmation do not match');
        return;
      }
    }

    try {
      const profilePayload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
        phone: formData.phone,
        salary: formData.salary === '' ? 0 : formData.salary,
        joining_date: formData.joining_date || null,
        profile_status: formData.profile_status !== false,
      };
      if (editingMember) {
        await client.patch(`/auth/staff/${editingMember.id}/`, profilePayload);
        toast.success('Staff member updated');
        if (selectedId === editingMember.id) fetchStaffDetail(editingMember.id);
      } else {
        await client.post('/auth/staff/', {
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
          ...profilePayload,
        });
        toast.success(
          `${ROLE_COLORS[formData.role]?.label || 'Staff'} account created. Login: ${formData.username.trim()} (${portalLabel})`,
          { duration: 5000 },
        );
      }
      setShowModal(false);
      setEditingMember(null);
      setFormData({
        username: '', first_name: '', last_name: '', email: '', role: 'STAFF',
        phone: '', salary: '', joining_date: '', password: '', confirm_password: '',
        profile_status: true,
      });
      fetchStaff();
    } catch (err) {
      const data = err.response?.data;
      const msg =
        data?.password?.[0] ||
        data?.username?.[0] ||
        data?.email?.[0] ||
        data?.role?.[0] ||
        data?.detail ||
        'Failed to save staff';
      toast.error(msg);
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (window.confirm('Remove this staff member?')) {
      try {
        await client.delete(`/auth/staff/${id}/`);
        toast.success('Staff member removed');
        if (selectedId === id) {
          setSelectedId(null);
          setSelectedMember(null);
        }
        fetchStaff();
      } catch (err) {
        toast.error('Failed to remove staff');
      }
    }
  };

  const roleStyle = selectedMember
    ? ROLE_COLORS[selectedMember.role] || ROLE_COLORS.STAFF
    : null;

  return (
    <>
      <div className={embedded ? 'staff-page staff-page--embedded' : 'staff-page animate-fade-in'}>
        {!embedded ? (
          <div className="page-header">
            <div>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                Manage your team - click a staff member to view full details.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={openAddModal}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <UserPlus size={18} /> Add Staff Member
            </button>
          </div>
        ) : (
          <div className="staff-page__toolbar">
            <button
              type="button"
              className="btn-primary"
              onClick={openAddModal}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <UserPlus size={18} /> Add Staff Member
            </button>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading staff...
          </div>
        ) : staff.length === 0 ? (
          <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <UserPlus size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: '16px', fontWeight: '600' }}>No staff members yet</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>Click &quot;Add Staff Member&quot; to get started.</p>
          </div>
        ) : (
          <div className={`split-layout ${selectedId ? 'split-layout--customers' : ''}`}>
            <div>
              <div className="search-toolbar search-toolbar--compact" style={{ marginBottom: 8 }}>
                <SearchInput
                  variant="inset"
                  placeholder="Search employees by name, username, role…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <DataTable
                  variant="erp"
                  sortable
                  showColumnChooser
                  pageSize={25}
                  selectedId={selectedId}
                  emptyTitle="No employees match your search"
                  emptyDescription="Try another name or add a staff member."
                  columns={[
                    { key: 'name', label: 'Employee' },
                    { key: 'username', label: 'Username' },
                    { key: 'role', label: 'Role', width: '110px' },
                    { key: 'email', label: 'Email' },
                  ]}
                  data={filteredStaff}
                  onRowClick={handleSelectStaff}
                  getSortValue={(row, key) => (key === 'name' ? staffDisplayName(row) : row[key])}
                  renderCell={(member, key) => {
                    const rs = ROLE_COLORS[member.role] || ROLE_COLORS.STAFF;
                    if (key === 'name') return <span style={{ fontWeight: 700 }}>{staffDisplayName(member)}</span>;
                    if (key === 'role') {
                      return (
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                          fontSize: 11, fontWeight: 700, backgroundColor: rs.bg, color: rs.color,
                        }}>
                          {rs.label}
                        </span>
                      );
                    }
                    return member[key] || '—';
                  }}
                />
              </div>
            </div>

            {selectedId && (
              <div className="card" style={{ padding: '24px', position: 'sticky', top: '24px' }}>
                {detailLoading ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading staff profile…
                  </div>
                ) : selectedMember ? (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '24px',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <StaffAvatar member={selectedMember} size={64} />
                        <div>
                          <h3 style={{ fontSize: '20px', fontWeight: '800' }}>
                            {staffDisplayName(selectedMember)}
                          </h3>
                          <span
                            style={{
                              display: 'inline-block',
                              marginTop: '6px',
                              padding: '4px 12px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '700',
                              backgroundColor: roleStyle.bg,
                              color: roleStyle.color,
                            }}
                          >
                            {roleStyle.label}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => openEditModal(selectedMember)}
                          style={{ padding: '8px', color: 'var(--primary)', background: 'transparent' }}
                          title="Edit staff"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(selectedId, e)}
                          style={{ padding: '8px', color: '#ef4444', background: 'transparent' }}
                          title="Remove staff"
                        >
                          <Trash2 size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedId(null)}
                          style={{ padding: '8px', color: 'var(--text-muted)', background: 'transparent' }}
                          title="Close"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '16px',
                        backgroundColor: 'var(--background)',
                        borderRadius: '12px',
                        marginBottom: '20px',
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                      }}
                    >
                      Sign in at the login page with username + password — {portalLabel} opens automatically.
                      Role <strong>{roleStyle.label}</strong> controls which pages they see.
                      Use &quot;Reset password&quot; below to change their password.
                    </div>

                    <h4
                      style={{
                        fontSize: '12px',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'var(--text-muted)',
                        marginBottom: '12px',
                      }}
                    >
                      Account details
                    </h4>
                    <div
                      className="form-grid-2"
                      style={{ gap: '14px', marginBottom: '24px', fontSize: '14px' }}
                    >
                      <DetailRow icon={User} label="Username" value={selectedMember.username} mono />
                      <DetailRow icon={Mail} label="Email" value={selectedMember.email} />
                      <DetailRow icon={User} label="Phone" value={selectedMember.phone || '-'} />
                      <DetailRow icon={Shield} label="Access role" value={roleStyle.label} />
                      <DetailRow
                        icon={Hash}
                        label="Salary (PKR)"
                        value={selectedMember.salary != null ? Number(selectedMember.salary).toLocaleString() : '-'}
                      />
                      <DetailRow
                        icon={Calendar}
                        label="Joining date"
                        value={formatDate(selectedMember.joining_date)}
                      />
                      <DetailRow icon={Hash} label="Staff ID" value={`#${selectedMember.id}`} mono />
                      <DetailRow
                        icon={User}
                        label="Login access"
                        value={selectedMember.profile_status !== false && selectedMember.is_active !== false ? 'Can sign in' : 'Blocked'}
                        valueColor={selectedMember.profile_status !== false && selectedMember.is_active !== false ? '#166534' : '#991b1b'}
                      />
                      <DetailRow
                        icon={Shield}
                        label="After login"
                        value={ROLE_LOGIN_ACCESS[selectedMember.role] || '-'}
                        span2
                      />
                      {selectedMember.tenant_name && (
                        <DetailRow
                          icon={Building2}
                          label="Venue / tenant"
                          value={selectedMember.tenant_name}
                          span2
                        />
                      )}
                      <DetailRow
                        icon={Calendar}
                        label="Joined"
                        value={formatDate(selectedMember.date_joined)}
                      />
                      <DetailRow
                        icon={Clock}
                        label="Last login"
                        value={formatDateTime(selectedMember.last_login)}
                      />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                        Reset password (admin)
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="password"
                          placeholder="New password (min 8 chars)"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="btn-secondary" onClick={handleResetPassword}>
                          Reset
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px dashed var(--border)',
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      This account can sign in with the username above. Admins can remove access
                      using the delete button - the user will no longer be able to log in.
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && createPortal(
        <div
          className="modal-overlay staff-modal-overlay"
          onClick={() => setShowModal(false)}
          role="presentation"
        >
          <div
            className="card modal-panel modal-panel--sm staff-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-modal-title"
          >
            <div className="staff-modal__head">
              <div>
                <h3 id="staff-modal-title">
                  {editingMember ? 'Edit Staff Member' : 'Add Staff Member'}
                </h3>
                <p>
                  {editingMember
                    ? 'Update role and login access for this account.'
                    : `Creates a ${portalLabel} login — username, password, and role.`}
                </p>
              </div>
              <button
                type="button"
                className="staff-modal__close"
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="staff-modal__form" noValidate>
              <div className="input-group">
                <label>Username (for login)</label>
                <input
                  required={!editingMember}
                  disabled={!!editingMember}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.replace(/\s/g, '') })}
                  placeholder="e.g. jane_smith"
                  autoComplete="off"
                />
              </div>
              <div className="form-grid-2">
                <div className="input-group">
                  <label>First Name</label>
                  <input
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    placeholder="Jane"
                  />
                </div>
                <div className="input-group">
                  <label>Last Name</label>
                  <input
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder="Smith"
                  />
                </div>
              </div>
              <div className="input-group">
                <label>Work Email</label>
                <input
                  type="email"
                  required={!editingMember}
                  disabled={!!editingMember}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="jane@gateway.com"
                />
              </div>
              <div className="input-group">
                <label>Role (controls login access)</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="STAFF">Staff — bookings & stays</option>
                  <option value="MANAGER">Manager — full except staff/settings</option>
                  <option value="ADMIN">Admin — full access</option>
                </select>
                <p className="staff-modal__hint">{ROLE_LOGIN_ACCESS[formData.role]}</p>
              </div>
              <div className="input-group">
                <label className="staff-modal__check">
                  <input
                    type="checkbox"
                    checked={formData.profile_status !== false}
                    onChange={(e) => setFormData({ ...formData, profile_status: e.target.checked })}
                  />
                  Allow login (account active)
                </label>
                <p className="staff-modal__hint">
                  Uncheck to block sign-in without deleting the account.
                </p>
              </div>
              {!editingMember && (
                <>
                  <div className="input-group">
                    <label>Login password</label>
                    <div className="staff-modal__password">
                      <Lock size={18} className="staff-modal__password-icon" aria-hidden />
                      <input
                        type={showCreatePassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Min. 8 characters"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="staff-modal__password-toggle"
                        onClick={() => setShowCreatePassword(!showCreatePassword)}
                        aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
                      >
                        {showCreatePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Confirm password</label>
                    <div className="staff-modal__password">
                      <Lock size={18} className="staff-modal__password-icon" aria-hidden />
                      <input
                        type={showCreatePassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={formData.confirm_password}
                        onChange={(e) =>
                          setFormData({ ...formData, confirm_password: e.target.value })
                        }
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="form-grid-2">
                <div className="input-group">
                  <label>Phone</label>
                  <input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="03xx-xxxxxxx"
                  />
                </div>
                <div className="input-group">
                  <label>Salary (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  />
                </div>
              </div>
              <div className="input-group">
                <label>Joining date</label>
                <input
                  type="date"
                  value={formData.joining_date}
                  onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                />
              </div>
              <div className="staff-modal__actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingMember ? 'Save changes' : 'Create Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

const DetailRow = ({ icon: Icon, label, value, mono, valueColor, span2 }) => (
  <div style={{ gridColumn: span2 ? 'span 2' : undefined }}>
    <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>
      {label}
    </p>
    <p
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontWeight: '600',
        color: valueColor || 'var(--text-main)',
        fontFamily: mono ? 'monospace' : 'inherit',
        fontSize: mono ? '13px' : '14px',
        wordBreak: 'break-word',
      }}
    >
      <Icon size={16} style={{ flexShrink: 0, color: 'var(--primary)' }} />
      {value}
    </p>
  </div>
);

export default Staff;
