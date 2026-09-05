import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Bell, Search, User, Menu, Wallet, Settings, LogOut, BookOpen, Scale } from 'lucide-react';
import SearchInput from './SearchInput';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { useIsMobile } from '../hooks/useMediaQuery';
import { globalSearch } from '../api/core';
import { guestHouseSearch } from '../api/guesthouse';
import { useAppType } from '../hooks/useAppType';
import { usePermissions } from '../hooks/usePermissions';
import { GhPageVisibilityProvider, useGhPageVisibility } from '../context/GhPageVisibilityContext';
import { HallPageVisibilityProvider } from '../context/HallPageVisibilityContext';
import { PageTitleProvider, usePageTitleContext } from '../context/PageTitleContext';
import { GH_PAGE_KEYS } from '../constants/ghPages';
import { resolveMediaUrl } from '../utils/media';

function DashboardHeaderTitle() {
  const { title } = usePageTitleContext();
  if (!title) return null;
  return <h1 className="dashboard-header__title">{title}</h1>;
}

const DashboardLayoutContent = () => {
  const { user, logout } = useAuth();
  const { isGuestHouse } = useAppType();
  const { canAccessPayments, canAccessSettings, canAccessDashboard } = usePermissions();
  const { isPageVisible } = useGhPageVisibility();
  const profilePath = isGuestHouse ? '/gh/profile' : '/profile';
  const paymentsPath = isGuestHouse ? '/gh/payments' : '/payments';
  const journalPath = isGuestHouse ? '/gh/journal-entries' : '/journal-entries';
  const accountingPath = isGuestHouse ? '/gh/accounting' : '/accounting';
  const trialBalancePath = isGuestHouse ? '/gh/accounting/trial-balance' : '/accounting/trial-balance';
  const settingsPath = isGuestHouse ? '/gh/settings' : '/settings';
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const { notifications, unreadCount, markAllRead } = useNotifications();

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      setSearchOpen(false);
      return undefined;
    }
    setSearchOpen(true);
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = isGuestHouse
          ? await guestHouseSearch(q)
          : await globalSearch(q);
        setSearchResults(data);
      } catch {
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, isGuestHouse]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    setShowNotifications(false);
  }, [location.pathname]);

  const showPaymentsMenu = canAccessPayments
    && (!isGuestHouse || isPageVisible(GH_PAGE_KEYS.PAYMENTS));
  const showProfileMenu = !isGuestHouse || isPageVisible(GH_PAGE_KEYS.PROFILE);
  const showSettingsMenu = canAccessSettings
    && (!isGuestHouse || isPageVisible(GH_PAGE_KEYS.SETTINGS));

  const profileMenuItems = [
    ...(showPaymentsMenu ? [{ label: 'Payments', icon: Wallet, path: paymentsPath }] : []),
    ...(canAccessDashboard ? [{ label: 'Journal Entries', icon: BookOpen, path: journalPath }] : []),
    ...(canAccessDashboard ? [{ label: 'Accounting', icon: Scale, path: accountingPath }] : []),
    ...(canAccessDashboard ? [{ label: 'Trial Balance', icon: Scale, path: trialBalancePath }] : []),
    ...(showProfileMenu ? [{ label: 'Profile', icon: User, path: profilePath }] : []),
    ...(showSettingsMenu ? [{ label: 'Settings', icon: Settings, path: settingsPath }] : []),
  ];

  const handleProfileNavigate = (path) => {
    setProfileMenuOpen(false);
    navigate(path);
  };

  const handleSignOut = () => {
    setProfileMenuOpen(false);
    logout();
  };

  const toggleProfileMenu = () => {
    setShowNotifications(false);
    setProfileMenuOpen((open) => !open);
  };

  const isProfileMenuItemActive = (path) => {
    if (path === settingsPath || path === paymentsPath) {
      return location.pathname === path || location.pathname.startsWith(`${path}/`);
    }
    return location.pathname === path;
  };

  useEffect(() => {
    if (!profileMenuOpen) return undefined;

    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!showNotifications) return undefined;

    const handleClickOutside = (event) => {
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [showNotifications]);

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const handleBellClick = () => {
    setProfileMenuOpen(false);
    setShowNotifications(!showNotifications);
    if (!showNotifications) markAllRead();
  };

  const closeSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
    setSearchOpen(false);
    setMobileSearchOpen(false);
  };

  const hasSearchHits = searchResults && (
    (searchResults.bookings?.length > 0)
    || (searchResults.stays?.length > 0)
    || (searchResults.customers?.length > 0)
    || (searchResults.venues?.length > 0)
    || (searchResults.rooms?.length > 0)
    || (canAccessPayments && searchResults.payments?.length > 0)
    || (searchResults.inventory?.length > 0)
  );

  const handleNotificationClick = (n) => {
    setShowNotifications(false);
    if (n.route) {
      navigate(n.route, n.routeState ? { state: n.routeState } : undefined);
      return;
    }
    if (n.type === 'payment' || n.type === 'payment_due') {
      if (!canAccessPayments) {
        if (n.stayId) navigate(`/gh/stays/${n.stayId}`);
        else if (n.bookingId) navigate(isGuestHouse ? `/gh/stays/${n.bookingId}` : `/bookings/${n.bookingId}`);
        return;
      }
      const payPath = isGuestHouse ? '/gh/payments' : '/payments';
      const stateKey = isGuestHouse ? 'preselectedStayId' : 'preselectedBookingId';
      navigate(payPath, n.bookingId || n.stayId ? {
        state: { [stateKey]: n.bookingId || n.stayId, autoOpenRecord: true },
      } : undefined);
    } else if (n.type === 'inventory') {
      navigate('/inventory');
    } else if (n.stayId) {
      navigate(`/gh/stays/${n.stayId}`);
    } else if (n.bookingId) {
      navigate(isGuestHouse ? `/gh/stays/${n.bookingId}` : '/bookings', isGuestHouse ? undefined : { state: { editBookingId: n.bookingId } });
    } else if (n.customerId) {
      navigate(isGuestHouse ? `/gh/customers/${n.customerId}` : `/customers/${n.customerId}`);
    }
  };

  const shellClass = [
    'dashboard-shell',
    !isMobile && isCollapsed ? 'dashboard-shell--collapsed' : '',
  ].filter(Boolean).join(' ');

  return (
    <PageTitleProvider>
    <div className={shellClass}>
      <div
        className={`sidebar-backdrop ${mobileMenuOpen ? 'sidebar-backdrop--visible' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden={!mobileMenuOpen}
      />
      <Sidebar
        isCollapsed={isMobile ? false : isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobile={isMobile}
        isMobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header__left">
            {isMobile && (
              <button
                type="button"
                className="btn-menu-mobile"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            )}
            <DashboardHeaderTitle />
          </div>

          <div className="dashboard-header__actions">
            {isMobile && !mobileSearchOpen && (
              <button
                type="button"
                className="btn-menu-mobile dashboard-header__search-toggle"
                onClick={() => setMobileSearchOpen(true)}
                aria-label="Search"
              >
                <Search size={20} />
              </button>
            )}
            <div
              className={`dashboard-header__search${isMobile && mobileSearchOpen ? ' dashboard-header__search--mobile-open' : ''}`}
              style={{
                display: isMobile && !mobileSearchOpen ? 'none' : undefined,
              }}
            >
              <SearchInput
                variant="header"
                placeholder={isGuestHouse ? 'Search stays, guests, rooms...' : 'Search bookings, customers...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim().length >= 2 && setSearchOpen(true)}
                onBlur={() => {
                  setTimeout(() => {
                    setSearchOpen(false);
                    if (isMobile && !searchQuery.trim()) setMobileSearchOpen(false);
                  }, 200);
                }}
                role="combobox"
                aria-expanded={searchOpen}
                aria-autocomplete="list"
              />
              {searchOpen && searchQuery.trim().length >= 2 && (
                <div
                  className="surface-dropdown dashboard-header__search-dropdown"
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: 'min(360px, calc(100vw - 32px))',
                    backgroundColor: 'var(--surface)', borderRadius: '12px', boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border)', zIndex: 9999, maxHeight: '320px', overflowY: 'auto',
                  }}
                >
                  {searchLoading ? (
                    <p style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>Searching…</p>
                  ) : hasSearchHits ? (
                    <>
                      {searchResults.stays?.map((s) => (
                        <button
                          key={`s-${s.id}`}
                          type="button"
                          onMouseDown={() => {
                            navigate(`/gh/stays/${s.id}`);
                            closeSearch();
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: '700' }}>{s.booking_ref}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Stay · {s.customer_name} · Room {s.room_number}</p>
                        </button>
                      ))}
                      {searchResults.rooms?.map((r) => (
                        <button
                          key={`r-${r.id}`}
                          type="button"
                          onMouseDown={() => {
                            navigate('/gh/settings?tab=rooms');
                            closeSearch();
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: '700' }}>Room {r.room_number}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Room</p>
                        </button>
                      ))}
                      {searchResults.bookings?.map((b) => (
                        <button
                          key={`b-${b.id}`}
                          type="button"
                          onMouseDown={() => {
                            navigate('/bookings', { state: { editBookingId: b.id } });
                            closeSearch();
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: '700' }}>{b.event_name}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Booking · {b.booking_id} · {b.customer_name}</p>
                        </button>
                      ))}
                      {searchResults.customers?.map((c) => (
                        <button
                          key={`c-${c.id}`}
                          type="button"
                          onMouseDown={() => {
                            navigate(isGuestHouse ? `/gh/customers/${c.id}` : `/customers/${c.id}`);
                            closeSearch();
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: '700' }}>{c.name}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Customer · {c.phone || '-'}</p>
                        </button>
                      ))}
                      {searchResults.venues?.map((v) => (
                        <button
                          key={`v-${v.id}`}
                          type="button"
                          onMouseDown={() => {
                            navigate('/settings?tab=halls');
                            closeSearch();
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: '700' }}>{v.name}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hall · {v.location}</p>
                        </button>
                      ))}
                      {canAccessPayments && searchResults.payments?.map((p) => (
                        <button
                          key={`p-${p.id}`}
                          type="button"
                          onMouseDown={() => {
                            navigate('/payments', {
                              state: { preselectedBookingId: p.booking_id, autoOpenRecord: true, bookingEventName: p.event_name },
                            });
                            closeSearch();
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: '700' }}>Rs {Number(p.amount).toLocaleString()}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Payment · {p.event_name}</p>
                        </button>
                      ))}
                      {searchResults.inventory?.map((item) => (
                        <button
                          key={`i-${item.id}`}
                          type="button"
                          onMouseDown={() => {
                            navigate('/inventory');
                            closeSearch();
                          }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: '13px', fontWeight: '700' }}>{item.name}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Inventory · {item.quantity} in stock</p>
                        </button>
                      ))}
                    </>
                  ) : (
                    <p style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>No results</p>
                  )}
                </div>
              )}
            </div>
            <ThemeToggle />
            <div ref={notificationMenuRef} className="dashboard-header__bell-wrap">
              <button
                type="button"
                className="dashboard-header__icon-btn"
                onClick={handleBellClick}
                aria-label="Notifications"
                aria-expanded={showNotifications}
                aria-haspopup="dialog"
              >
                <Bell size={20} color="currentColor" />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    minWidth: '16px', height: '16px',
                    backgroundColor: 'var(--primary)', borderRadius: '8px',
                    border: '2px solid var(--surface)', fontSize: '9px', fontWeight: '700',
                    color: 'white', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', padding: '0 3px'
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="animate-fade-in surface-dropdown" style={{
                  position: 'absolute', top: '44px', right: 0, width: 'min(340px, calc(100vw - 32px))',
                  backgroundColor: 'var(--surface)', borderRadius: '16px',
                  boxShadow: 'var(--shadow-lg)',
                  border: '1px solid var(--border)', zIndex: 9999, overflow: 'hidden'
                }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '700' }}>Notifications</h4>
                    <span className="surface-muted-chip" style={{ fontSize: '10px', color: 'var(--text-muted)', backgroundColor: 'var(--surface-elevated)', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>
                      Live
                    </span>
                  </div>
                  <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Bell size={32} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
                        <p style={{ fontSize: '13px' }}>No recent activity</p>
                      </div>
                    ) : (
                      notifications.map((n, i) => (
                        <div
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleNotificationClick(n)}
                          onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}
                          style={{
                            padding: '13px 20px',
                            borderBottom: i === notifications.length - 1 ? 'none' : '1px solid var(--border)',
                            cursor: 'pointer', transition: 'background 0.2s',
                            display: 'flex', gap: '12px', alignItems: 'flex-start'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--background)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '1px' }}>{n.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '13px', fontWeight: '700', marginBottom: '2px' }}>{n.title}</p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.desc}</p>
                            <p style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: '600' }}>{n.timeAgo}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="surface-footer-bar" style={{ padding: '10px', textAlign: 'center', backgroundColor: 'var(--background)', borderTop: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifications(false);
                        navigate(isGuestHouse ? '/gh/notifications' : '/notifications');
                      }}
                      style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        color: 'var(--primary)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 8px',
                      }}
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              ref={profileMenuRef}
              className="dashboard-header__profile-wrap"
            >
              <button
                type="button"
                className="dashboard-header__profile"
                onClick={toggleProfileMenu}
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
              >
                <div className="dashboard-header__profile-text hide-mobile">
                  <p style={{ fontSize: '14px', fontWeight: '600' }}>{user?.first_name} {user?.last_name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{user?.role}</p>
                </div>
                <div className="dashboard-header__profile-avatar">
                  {user?.avatar ? (
                    <img
                      src={resolveMediaUrl(user.avatar)}
                      alt="Profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <User size={20} color="var(--primary)" />
                  )}
                </div>
              </button>

              {profileMenuOpen && (
                <div className="dashboard-header__profile-menu animate-fade-in surface-dropdown" role="menu">
                  {profileMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = isProfileMenuItemActive(item.path);
                    return (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        className={`dashboard-header__profile-menu-item${isActive ? ' dashboard-header__profile-menu-item--active' : ''}`}
                        onClick={() => handleProfileNavigate(item.path)}
                      >
                        <Icon size={16} aria-hidden />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                  <div className="dashboard-header__profile-menu-divider" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="dashboard-header__profile-menu-item dashboard-header__profile-menu-item--danger"
                    onClick={handleSignOut}
                  >
                    <LogOut size={16} aria-hidden />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          <Outlet />
        </div>
      </main>
    </div>
    </PageTitleProvider>
  );
};

const DashboardLayout = () => {
  const { isGuestHouse } = useAppType();
  return (
    <GhPageVisibilityProvider enabled={isGuestHouse}>
      <HallPageVisibilityProvider enabled={!isGuestHouse}>
        <DashboardLayoutContent />
      </HallPageVisibilityProvider>
    </GhPageVisibilityProvider>
  );
};

export default DashboardLayout;
