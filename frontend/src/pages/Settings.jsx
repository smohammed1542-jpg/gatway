import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  User, 
  Building2, 
  Bell, 
  Shield, 
  Globe,
  Save,
  Eye,
  EyeOff,
  LayoutGrid,
  BedDouble,
  BadgeCheck,
  Archive,
  Camera,
  Mail,
  AtSign,
  Lock,
  Snowflake,
} from 'lucide-react';
import client from '../api/client';
import { changePassword, updateMe, uploadAvatar } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { getTenant, updateTenant, getUserSettings, updateUserSettings } from '../api/core';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import { useAppType } from '../hooks/useAppType';
import { usePermissions } from '../hooks/usePermissions';
import AppLoader from '../components/AppLoader';
import HallManagement from './HallManagement';
import GuestHouseRooms from './guesthouse/Rooms';
import GhServices from './guesthouse/GhServices';
import Staff from './Staff';
import AllRecords from './guesthouse/AllRecords';
import { useGhPageVisibility } from '../context/GhPageVisibilityContext';
import { useHallPageVisibility } from '../context/HallPageVisibilityContext';
import { GH_PAGE_KEYS } from '../constants/ghPages';
import { HALL_PAGE_KEYS } from '../constants/hallPages';
import { resolveMediaUrl } from '../utils/media';
import { ghStayTimesFromTenant } from '../utils/ghStay';
import StatusBadge from '../components/ui/StatusBadge';

const formatDateTime = (value) => {
  if (!value) return 'Never';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const profileInitials = (user) => {
  const first = user?.first_name?.[0] || '';
  const last = user?.last_name?.[0] || '';
  const combined = `${first}${last}`.toUpperCase();
  if (combined) return combined;
  return user?.username?.[0]?.toUpperCase() || 'A';
};

const formatRole = (role) => {
  if (!role) return 'Staff';
  return String(role)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const TAB_HEADINGS = {
  Profile: { title: 'My profile', subtitle: 'Update your photo, display name, and view account details.' },
  Halls: { title: 'Hall management', subtitle: 'Venues, capacity, and pricing for Marriage Hall bookings.' },
  Units: {
    title: 'Units',
    subtitle: 'Suites, suite rooms, and independent rooms in one parent–child inventory.',
  },
  'Add-on Services': { title: 'Add-on services', subtitle: 'Manage AC, breakfast, laundry, and other extras for stays.' },
  Staff: { title: 'Employees', subtitle: 'Team accounts, roles, and access for your organization.' },
  'All Records': { title: 'All records', subtitle: 'Reservations, payments, and expense vouchers in one ledger.' },
  'Venue Info': {
    title: 'Venue information',
    subtitle: 'Official name, contact details, and default guest stay times.',
  },
  Notifications: { title: 'Notifications', subtitle: 'In-app alerts and customer SMS / WhatsApp preferences.' },
  Security: { title: 'Security', subtitle: 'Password, last login, and account status.' },
  System: { title: 'System', subtitle: 'Theme, language, and timezone preferences.' },
};

const parseApiError = (err) => {
  const data = err.response?.data;
  if (!data) return 'Something went wrong. Please try again.';
  if (typeof data.detail === 'string') return data.detail;
  const firstKey = Object.keys(data)[0];
  const val = data[firstKey];
  if (Array.isArray(val)) return val[0];
  if (typeof val === 'string') return val;
  return 'Something went wrong. Please try again.';
};

const TAB_FROM_PARAM = {
  halls: 'Halls',
  rooms: 'Units',
  services: 'Add-on Services',
  staff: 'Staff',
  records: 'All Records',
  profile: 'Profile',
  venue: 'Venue Info',
  notifications: 'Notifications',
  security: 'Security',
  system: 'System',
};

const Settings = () => {
  const { theme, setThemeMode } = useTheme();
  const { refreshUser: syncAuthUser } = useAuth();
  const { isMarriageHall, isGuestHouse } = useAppType();
  const { isAdmin } = usePermissions();
  const avatarInputRef = useRef(null);
  const navRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const { isPageVisible: isGhPageVisible } = useGhPageVisibility();
  const { isPageVisible: isHallPageVisible } = useHallPageVisibility();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = TAB_FROM_PARAM[tabParam] || 'Profile';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userData, setUserData] = useState(null);
  const [tenantData, setTenantData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '' });
  const [tenantForm, setTenantForm] = useState({
    name: '',
    phone: '',
    address: '',
    gh_default_check_in_time: '18:00',
    gh_default_check_out_time: '11:00',
    tax_rate: 0.05,
    overtime_rate_per_hour: 5000,
  });
  const [notifSettings, setNotifSettings] = useState({
    notify_new_bookings: true,
    notify_payments: true,
    notify_weekly_reports: true,
    notify_staff_activity: true,
    sms_to_customers: false,
    whatsapp_to_customers: false,
  });
  const [systemSettings, setSystemSettings] = useState({
    timezone: 'Asia/Karachi',
    language: 'en',
    theme: 'light',
  });

  const loadSettings = async () => {
    try {
      const [userRes, tenantRes, prefsRes] = await Promise.all([
        client.get('/auth/me/'),
        getTenant().catch(() => null),
        getUserSettings().catch(() => null),
      ]);
      setUserData(userRes.data);
      setProfileForm({
        first_name: userRes.data.first_name || '',
        last_name: userRes.data.last_name || '',
      });
      if (tenantRes) {
        setTenantData(tenantRes);
        const stayTimes = ghStayTimesFromTenant(tenantRes);
        setTenantForm({
          name: tenantRes.name || '',
          phone: tenantRes.phone || '',
          address: tenantRes.address || '',
          gh_default_check_in_time: stayTimes.checkInTime,
          gh_default_check_out_time: stayTimes.checkOutTime,
          tax_rate: tenantRes.tax_rate ?? 0.05,
          overtime_rate_per_hour: tenantRes.overtime_rate_per_hour ?? 5000,
        });
      }
      if (prefsRes) {
        setNotifSettings({
          notify_new_bookings: prefsRes.notify_new_bookings ?? true,
          notify_payments: prefsRes.notify_payments ?? true,
          notify_weekly_reports: prefsRes.notify_weekly_reports ?? true,
          notify_staff_activity: prefsRes.notify_staff_activity ?? true,
          sms_to_customers: prefsRes.sms_to_customers ?? false,
          whatsapp_to_customers: prefsRes.whatsapp_to_customers ?? false,
        });
        const savedTheme = prefsRes.theme || 'light';
        setSystemSettings({
          timezone: prefsRes.timezone || 'Asia/Karachi',
          language: prefsRes.language || 'en',
          theme: savedTheme,
        });
        setThemeMode(savedTheme);
      }
    } catch (err) {
      console.error('Failed to fetch settings data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const tabAllowed = (tabName) => {
    if (isGuestHouse) {
      if (tabName === 'Units') return isGhPageVisible(GH_PAGE_KEYS.ROOMS);
      if (tabName === 'Add-on Services') return isGhPageVisible(GH_PAGE_KEYS.SERVICES);
      if (tabName === 'All Records') return isGhPageVisible(GH_PAGE_KEYS.RECORDS);
      if (tabName === 'Staff') return isAdmin && isGhPageVisible(GH_PAGE_KEYS.STAFF);
      return true;
    }
    if (isMarriageHall) {
      if (tabName === 'Halls') return isHallPageVisible(HALL_PAGE_KEYS.HALLS);
      if (tabName === 'Staff') return isAdmin && isHallPageVisible(HALL_PAGE_KEYS.STAFF);
    }
    return true;
  };

  useEffect(() => {
    const mapped = TAB_FROM_PARAM[tabParam];
    if (!mapped) return;
    if (mapped === 'Staff' && !isAdmin) {
      setActiveTab('Profile');
      setSearchParams({});
      return;
    }
    if (!tabAllowed(mapped)) {
      setActiveTab('Profile');
      setSearchParams({});
      return;
    }
    setActiveTab(mapped);
  }, [tabParam, isAdmin, setSearchParams, isGuestHouse, isMarriageHall, isGhPageVisible, isHallPageVisible]);

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    const param = Object.entries(TAB_FROM_PARAM).find(([, name]) => name === tabName)?.[0];
    if (param) setSearchParams({ tab: param });
    else setSearchParams({});
  };

  useEffect(() => {
    const activeEl = navRef.current?.querySelector('.settings-nav-item--active');
    activeEl?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  const reloadUserData = async () => {
    const userRes = await client.get('/auth/me/');
    setUserData(userRes.data);
    return userRes.data;
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be smaller than 2MB.');
      return;
    }
    setAvatarUploading(true);
    try {
      await uploadAvatar(file);
      const updated = await syncAuthUser();
      setUserData(updated);
      toast.success('Profile photo updated.');
    } catch {
      toast.error('Failed to upload photo.');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleChangePassword = async () => {
    const { current_password, new_password, confirm_password } = passwordForm;

    if (!current_password || !new_password || !confirm_password) {
      toast.error('Please fill in all password fields.');
      return;
    }
    if (new_password.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (new_password !== confirm_password) {
      toast.error('New password and confirmation do not match.');
      return;
    }

    setIsSaving(true);
    try {
      await changePassword({ current_password, new_password, confirm_password });
      toast.success('Password updated successfully.');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      await reloadUserData();
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileForm.first_name?.trim() || !profileForm.last_name?.trim()) {
      toast.error('First name and last name are required.');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateMe(profileForm);
      setUserData(updated);
      await syncAuthUser();
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveVenue = async () => {
    setIsSaving(true);
    try {
      const updated = await updateTenant(tenantForm);
      setTenantData(updated);
      toast.success('Venue information saved.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setIsSaving(true);
    try {
      await updateUserSettings(notifSettings);
      toast.success('Notification preferences saved.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSystem = async () => {
    setIsSaving(true);
    try {
      await updateUserSettings({ ...systemSettings, theme });
      toast.success('System preferences saved.');
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    if (activeTab === 'Security') handleChangePassword();
    else if (activeTab === 'Profile') handleSaveProfile();
    else if (activeTab === 'Venue Info') handleSaveVenue();
    else if (activeTab === 'Notifications') handleSaveNotifications();
    else if (activeTab === 'System') handleSaveSystem();
  };

  const showSaveButton = ['Profile', 'Venue Info', 'Notifications', 'Security', 'System'].includes(activeTab);
  const saveLabel =
    activeTab === 'Security' ? (isSaving ? 'Updating…' : 'Update Password') : (isSaving ? 'Saving…' : 'Save Changes');

  const tabs = [
    { name: 'Profile', icon: User },
    ...(isMarriageHall && isHallPageVisible(HALL_PAGE_KEYS.HALLS) ? [{ name: 'Halls', icon: LayoutGrid }] : []),
    ...(isGuestHouse && isGhPageVisible(GH_PAGE_KEYS.ROOMS) ? [{ name: 'Units', icon: BedDouble }] : []),
    ...(isGuestHouse && isGhPageVisible(GH_PAGE_KEYS.SERVICES) ? [{ name: 'Add-on Services', icon: Snowflake }] : []),
    ...(isGuestHouse && isGhPageVisible(GH_PAGE_KEYS.RECORDS) ? [{ name: 'All Records', icon: Archive }] : []),
    ...(isAdmin && (
      (isGuestHouse && isGhPageVisible(GH_PAGE_KEYS.STAFF))
      || (isMarriageHall && isHallPageVisible(HALL_PAGE_KEYS.STAFF))
    ) ? [{ name: 'Staff', icon: BadgeCheck }] : []),
    { name: 'Venue Info', icon: Building2 },
    { name: 'Notifications', icon: Bell },
    { name: 'Security', icon: Shield },
    { name: 'System', icon: Globe },
  ];

  const InputGroup = ({ label, children, description, readOnly = false }) => (
    <div className={`settings-field${readOnly ? ' settings-field--readonly' : ''}`}>
      <label className="settings-field__label">{label}</label>
      <div className="settings-field__control">{children}</div>
      {description && <p className="settings-field__hint">{description}</p>}
    </div>
  );

  const panelHeading = TAB_HEADINGS[activeTab] || { title: `${activeTab} settings`, subtitle: '' };

  const Toggle = ({ active, onClick }) => (
    <div 
      onClick={onClick}
      style={{ 
        width: '44px', 
        height: '24px', 
        backgroundColor: active ? 'var(--primary)' : 'var(--toggle-track)', 
        borderRadius: '12px', 
        position: 'relative', 
        cursor: 'pointer',
        transition: 'background 0.2s'
      }}
    >
      <div style={{ 
        position: 'absolute', 
        top: '2px', 
        left: active ? '22px' : '2px', 
        width: '20px', 
        height: '20px', 
        backgroundColor: 'var(--surface)', 
        borderRadius: '50%', 
        transition: 'left 0.2s',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}></div>
    </div>
  );

  if (isLoading) return <AppLoader message="Loading settings…" />;

  return (
    <div className="animate-fade-in settings-page">
      <div className="settings-layout">
        <div className="settings-nav-wrap">
          <nav className="settings-nav" aria-label="Settings sections" ref={navRef}>
            {tabs.map((tab) => (
              <button
                key={tab.name}
                type="button"
                onClick={() => handleTabChange(tab.name)}
                className={`settings-nav-item${activeTab === tab.name ? ' settings-nav-item--active' : ''}`}
              >
                <tab.icon size={18} aria-hidden />
                <span className="settings-nav-item__label">{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className={`card settings-panel-card${['Halls', 'Units', 'Add-on Services', 'Staff', 'All Records'].includes(activeTab) ? ' settings-panel-card--wide' : ''}${activeTab === 'Profile' ? ' settings-panel-card--profile' : ''}`}>
          <div className="settings-panel-card__head">
            <div style={{ minWidth: 0 }}>
              <h3 className="settings-panel-card__title">{panelHeading.title}</h3>
              {panelHeading.subtitle && (
                <p className="settings-panel-card__subtitle">{panelHeading.subtitle}</p>
              )}
            </div>
            {showSaveButton && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={isSaving}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}
              >
                <Save size={16} /> {saveLabel}
              </button>
            )}
          </div>

          <div className={`settings-panel-card__body${['Halls', 'Units', 'Add-on Services', 'Staff', 'All Records'].includes(activeTab) ? ' settings-panel-card__body--wide' : ''}`}>
            {activeTab === 'Halls' && isMarriageHall && (
              <HallManagement embedded />
            )}

            {activeTab === 'Units' && isGuestHouse && (
              <GuestHouseRooms embedded />
            )}

            {activeTab === 'Add-on Services' && isGuestHouse && (
              <GhServices embedded />
            )}

            {activeTab === 'Staff' && isAdmin && (
              <Staff embedded />
            )}

            {activeTab === 'All Records' && isGuestHouse && (
              <AllRecords embedded />
            )}

            {activeTab === 'Profile' && (
              <div className="settings-profile animate-fade-in">
                <div className="settings-profile-card">
                  <div className="settings-profile-card__banner" aria-hidden />
                  <div className="settings-profile-card__body">
                    <button
                      type="button"
                      className="settings-profile-card__avatar"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      aria-label="Change profile photo"
                    >
                      {userData?.avatar ? (
                        <img
                          src={resolveMediaUrl(userData.avatar)}
                          alt=""
                          className="settings-profile-card__photo"
                        />
                      ) : (
                        <span className="settings-profile-card__initials">{profileInitials(userData)}</span>
                      )}
                      <span className="settings-profile-card__avatar-edit" aria-hidden>
                        <Camera size={16} />
                      </span>
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={handleAvatarChange}
                    />

                    <div className="settings-profile-card__identity">
                      <h4 className="settings-profile-card__name">
                        {[userData?.first_name, userData?.last_name].filter(Boolean).join(' ') || userData?.username || 'Your account'}
                      </h4>
                      <p className="settings-profile-card__email">
                        <Mail size={14} aria-hidden />
                        {userData?.email || 'No email on file'}
                      </p>
                      <p className="settings-profile-card__org">
                        <Building2 size={14} aria-hidden />
                        {tenantData?.name || 'Your organization'}
                      </p>
                      <div className="settings-profile-card__badges">
                        <span className="settings-profile-card__role">
                          <Shield size={12} aria-hidden />
                          {formatRole(userData?.role)}
                        </span>
                        <StatusBadge
                          status={userData?.is_active ? 'ACTIVE' : 'INACTIVE'}
                          label={userData?.is_active ? 'Active' : 'Inactive'}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <section className="settings-form-section">
                  <div className="settings-form-section__head">
                    <h4 className="settings-form-section__title">Personal information</h4>
                    <p className="settings-form-section__desc">
                      Username and email are managed by your administrator. You can update your display name below.
                    </p>
                  </div>

                  <div className="settings-form-grid">
                    <InputGroup label="Username" readOnly description="Sign-in username cannot be changed here.">
                      <AtSign size={16} className="settings-field__icon" aria-hidden />
                      <input type="text" className="settings-input" value={userData?.username || ''} readOnly />
                      <Lock size={14} className="settings-field__lock" aria-hidden />
                    </InputGroup>

                    <InputGroup label="Email address" readOnly description="Contact your admin to change your email.">
                      <Mail size={16} className="settings-field__icon" aria-hidden />
                      <input type="email" className="settings-input" value={userData?.email || ''} readOnly />
                      <Lock size={14} className="settings-field__lock" aria-hidden />
                    </InputGroup>

                    <InputGroup label="First name">
                      <User size={16} className="settings-field__icon" aria-hidden />
                      <input
                        type="text"
                        className="settings-input"
                        value={profileForm.first_name}
                        onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                        placeholder="First name"
                        autoComplete="given-name"
                      />
                    </InputGroup>

                    <InputGroup label="Last name">
                      <User size={16} className="settings-field__icon" aria-hidden />
                      <input
                        type="text"
                        className="settings-input"
                        value={profileForm.last_name}
                        onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                        placeholder="Last name"
                        autoComplete="family-name"
                      />
                    </InputGroup>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'Venue Info' && (
              <div className="animate-fade-in">
                <InputGroup label="Venue Official Name">
                  <input
                    type="text"
                    value={tenantForm.name}
                    onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </InputGroup>
                <InputGroup label="Phone">
                  <input
                    type="text"
                    value={tenantForm.phone}
                    onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })}
                    style={{ width: '100%' }}
                    placeholder="03xx-xxxxxxx"
                  />
                </InputGroup>
                <InputGroup label="Address">
                  <textarea
                    value={tenantForm.address}
                    onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })}
                    style={{ width: '100%', minHeight: '80px' }}
                    placeholder="Hall address for contracts & receipts"
                  />
                </InputGroup>
                <InputGroup label="Subdomain">
                  <input type="text" value={tenantData?.subdomain || ''} style={{ width: '100%' }} readOnly />
                </InputGroup>
                <InputGroup label="Current Plan">
                  <input type="text" value={tenantData?.plan_type || ''} style={{ width: '100%' }} readOnly />
                </InputGroup>
                <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '28px 0 12px' }}>Tax & overtime</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Used on hall bookings and journal tax lines. Posted documents keep their original amounts.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                  <InputGroup label="Sales tax rate">
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={tenantForm.tax_rate}
                      onChange={(e) => setTenantForm({ ...tenantForm, tax_rate: e.target.value })}
                      style={{ width: '100%' }}
                      aria-label="Sales tax rate"
                    />
                  </InputGroup>
                  <InputGroup label="Overtime per hour (PKR)">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={tenantForm.overtime_rate_per_hour}
                      onChange={(e) => setTenantForm({ ...tenantForm, overtime_rate_per_hour: e.target.value })}
                      style={{ width: '100%' }}
                      aria-label="Overtime rate per hour"
                    />
                  </InputGroup>
                </div>
                {isGuestHouse && (
                  <>
                    <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '28px 0 12px' }}>Default stay times</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Starting check-in and check-out times for new bookings. You can still change them on each reservation.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                      <InputGroup label="Check-in time">
                        <input
                          type="time"
                          value={tenantForm.gh_default_check_in_time}
                          onChange={(e) => setTenantForm({
                            ...tenantForm,
                            gh_default_check_in_time: e.target.value,
                          })}
                          style={{ width: '100%' }}
                          aria-label="Default check-in time"
                        />
                      </InputGroup>
                      <InputGroup label="Check-out time">
                        <input
                          type="time"
                          value={tenantForm.gh_default_check_out_time}
                          onChange={(e) => setTenantForm({
                            ...tenantForm,
                            gh_default_check_out_time: e.target.value,
                          })}
                          style={{ width: '100%' }}
                          aria-label="Default check-out time"
                        />
                      </InputGroup>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'Notifications' && (
              <div className="animate-fade-in">
                <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>In-app bell alerts</h4>
                {[
                  { key: 'notify_new_bookings', title: 'New Bookings', desc: 'Show new reservations in the notification bell.' },
                  { key: 'notify_payments', title: 'Payment Updates', desc: 'Show when payments are recorded.' },
                  { key: 'notify_weekly_reports', title: 'Upcoming Events', desc: 'Show events in the next 7 days.' },
                  { key: 'notify_staff_activity', title: 'Payment Due Reminders', desc: 'Show bookings with balance still due.' },
                ].map((item, i) => (
                  <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600' }}>{item.title}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.desc}</p>
                    </div>
                    <Toggle
                      active={notifSettings[item.key]}
                      onClick={() => setNotifSettings({ ...notifSettings, [item.key]: !notifSettings[item.key] })}
                    />
                  </div>
                ))}
                <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '28px 0 16px' }}>Customer SMS / WhatsApp</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Sends only when the customer has a phone number on file. No phone validation required.
                </p>
                {[
                  { key: 'sms_to_customers', title: 'SMS to customer', desc: 'Text message on booking confirm & payment.' },
                  { key: 'whatsapp_to_customers', title: 'WhatsApp to customer', desc: 'WhatsApp message (Twilio) on same events.' },
                ].map((item) => (
                  <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600' }}>{item.title}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.desc}</p>
                    </div>
                    <Toggle
                      active={notifSettings[item.key]}
                      onClick={() => setNotifSettings({ ...notifSettings, [item.key]: !notifSettings[item.key] })}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'Security' && (
              <div className="animate-fade-in">
                <div
                  style={{
                    padding: '20px',
                    backgroundColor: 'var(--background)',
                    borderRadius: '12px',
                    marginBottom: '28px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '16px' }}>Account overview</h4>
                  <div className="form-grid-2" style={{ gap: '12px', fontSize: '14px' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Username</p>
                      <p style={{ fontWeight: '600', marginTop: '4px' }}>{userData?.username || '-'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Email</p>
                      <p style={{ fontWeight: '600', marginTop: '4px' }}>{userData?.email || '-'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Last login</p>
                      <p style={{ fontWeight: '600', marginTop: '4px' }}>{formatDateTime(userData?.last_login)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Member since</p>
                      <p style={{ fontWeight: '600', marginTop: '4px' }}>{formatDateTime(userData?.date_joined)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Status</p>
                      <p style={{ fontWeight: '700', marginTop: '4px', color: userData?.is_active ? '#166534' : '#991b1b' }}>
                        {userData?.is_active ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Role</p>
                      <p style={{ fontWeight: '600', marginTop: '4px' }}>{userData?.role || '-'}</p>
                    </div>
                  </div>
                </div>

                <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>Change password</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  Enter your current password, then choose a new one (minimum 8 characters). Changes apply immediately.
                </p>

                <InputGroup label="Current password" description="Required to verify it is you.">
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      style={{ width: '100%', paddingRight: '44px' }}
                      placeholder="Current password"
                      value={passwordForm.current_password}
                      onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'transparent', color: 'var(--text-muted)' }}
                    >
                      {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </InputGroup>

                <div className="form-grid-2" style={{ gap: '20px' }}>
                  <InputGroup label="New password">
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        style={{ width: '100%', paddingRight: '44px' }}
                        placeholder="At least 8 characters"
                        value={passwordForm.new_password}
                        onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'transparent', color: 'var(--text-muted)' }}
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </InputGroup>
                  <InputGroup label="Confirm new password">
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        style={{ width: '100%', paddingRight: '44px' }}
                        placeholder="Repeat new password"
                        value={passwordForm.confirm_password}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', backgroundColor: 'transparent', color: 'var(--text-muted)' }}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </InputGroup>
                </div>

                {passwordForm.new_password.length > 0 && (
                  <p
                    style={{
                      fontSize: '12px',
                      marginTop: '8px',
                      color: passwordForm.new_password.length >= 8 ? '#166534' : '#b45309',
                      fontWeight: '600',
                    }}
                  >
                    {passwordForm.new_password.length >= 8
                      ? '✓ Password length OK'
                      : `${8 - passwordForm.new_password.length} more character(s) needed`}
                  </p>
                )}

                {passwordForm.confirm_password.length > 0 && (
                  <p
                    style={{
                      fontSize: '12px',
                      marginTop: '6px',
                      color:
                        passwordForm.new_password === passwordForm.confirm_password
                          ? '#166534'
                          : '#dc2626',
                      fontWeight: '600',
                    }}
                  >
                    {passwordForm.new_password === passwordForm.confirm_password
                      ? '✓ Passwords match'
                      : '✗ Passwords do not match'}
                  </p>
                )}
              </div>
            )}

            {activeTab === 'System' && (
              <div className="animate-fade-in">
                <InputGroup label="Appearance" description="Switch between light and dark mode across the app.">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <ThemeToggle className="theme-toggle--with-label" showLabel />
                    <select
                      style={{ flex: 1, minWidth: '160px' }}
                      value={theme}
                      onChange={(e) => {
                        setThemeMode(e.target.value);
                        setSystemSettings((s) => ({ ...s, theme: e.target.value }));
                      }}
                    >
                      <option value="light">Light theme</option>
                      <option value="dark">Dark theme</option>
                    </select>
                  </div>
                </InputGroup>
                <InputGroup label="Interface Language">
                  <select
                    style={{ width: '100%' }}
                    value={systemSettings.language}
                    onChange={(e) => setSystemSettings({ ...systemSettings, language: e.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="ur">Urdu</option>
                  </select>
                </InputGroup>
                <InputGroup label="Timezone">
                  <select
                    style={{ width: '100%' }}
                    value={systemSettings.timezone}
                    onChange={(e) => setSystemSettings({ ...systemSettings, timezone: e.target.value })}
                  >
                    <option value="Asia/Karachi">(GMT+05:00) Islamabad, Karachi</option>
                    <option value="Asia/Dubai">(GMT+04:00) Dubai</option>
                    <option value="UTC">(GMT+00:00) UTC</option>
                  </select>
                </InputGroup>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
