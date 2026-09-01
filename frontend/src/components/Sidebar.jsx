import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Calculator,
  Calendar,
  Users,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Package,
  Sparkles,
  CalendarDays,
  Bell,
  X,
  CalendarCheck,
  Plus,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import AppLoader from '../components/AppLoader';
import { usePermissions } from '../hooks/usePermissions';
import { useAppType } from '../hooks/useAppType';
import { useGhPageVisibility } from '../context/GhPageVisibilityContext';
import { useHallPageVisibility } from '../context/HallPageVisibilityContext';
import { GH_PAGE_KEYS } from '../constants/ghPages';
import { HALL_PAGE_KEYS } from '../constants/hallPages';
import AppLogo from './AppLogo';

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobile, isMobileOpen, onMobileClose }) => {
  const { isGuestHouse } = useAppType();
  const {
    user,
    loading,
    canAccessExpenses,
    canAccessNotifications,
    canAccessDashboard,
  } = usePermissions();
  const { isPageVisible: isGhPageVisible } = useGhPageVisibility();
  const { isPageVisible: isHallPageVisible } = useHallPageVisibility();
  const [acctOpen, setAcctOpen] = useState(false);

  const hallNavItems = [
    { name: 'Bookings', icon: Calendar, path: '/bookings', pageKey: HALL_PAGE_KEYS.BOOKINGS },
    { name: 'Calendar', icon: CalendarDays, path: '/calendar', pageKey: HALL_PAGE_KEYS.CALENDAR },
    { name: 'Customers', icon: Users, path: '/customers', pageKey: HALL_PAGE_KEYS.CUSTOMERS },
    ...(canAccessExpenses ? [{ name: 'Expenses', icon: Wallet, path: '/expenses', pageKey: HALL_PAGE_KEYS.EXPENSES }] : []),
    { name: 'Inventory', icon: Package, path: '/inventory', pageKey: HALL_PAGE_KEYS.INVENTORY },
    { name: 'Decorations', icon: Sparkles, path: '/decoration-packages', pageKey: HALL_PAGE_KEYS.DECORATIONS },
    ...(canAccessNotifications ? [{ name: 'Notifications', icon: Bell, path: '/notifications', pageKey: HALL_PAGE_KEYS.NOTIFICATIONS }] : []),
  ].filter((item) => !item.pageKey || isHallPageVisible(item.pageKey));

  const guestHouseNavItems = [
    { name: 'Reservation', icon: Plus, path: '/gh/book', pageKey: GH_PAGE_KEYS.BOOK },
    { name: 'Stays', icon: CalendarCheck, path: '/gh/stays', pageKey: GH_PAGE_KEYS.STAYS },
    { name: 'Calendar', icon: CalendarDays, path: '/gh/calendar', pageKey: GH_PAGE_KEYS.CALENDAR },
    { name: 'Guests', icon: Users, path: '/gh/customers', pageKey: GH_PAGE_KEYS.CUSTOMERS },
    ...(canAccessExpenses ? [{ name: 'Expenses', icon: Wallet, path: '/gh/expenses', pageKey: GH_PAGE_KEYS.EXPENSES }] : []),
    ...(canAccessNotifications ? [{ name: 'Notifications', icon: Bell, path: '/gh/notifications', pageKey: GH_PAGE_KEYS.NOTIFICATIONS }] : []),
  ].filter((item) => !item.pageKey || isGhPageVisible(item.pageKey));

  const dashboardNavItem = isGuestHouse
    ? { name: 'Dashboard', icon: Calculator, path: '/gh/dashboard', pageKey: GH_PAGE_KEYS.DASHBOARD }
    : { name: 'Financials', icon: Calculator, path: '/dashboard', pageKey: HALL_PAGE_KEYS.DASHBOARD };

  const acctBase = isGuestHouse ? '/gh/accounting' : '/accounting';
  const accountingLinks = [
    { name: 'Acct. Dashboard', path: acctBase },
    { name: 'Chart of Accounts', path: `${acctBase}/accounts` },
    { name: 'Journal Entries', path: isGuestHouse ? '/gh/journal-entries' : '/journal-entries' },
    { name: 'General Ledger', path: `${acctBase}/general-ledger` },
    { name: 'Customer Ledger', path: `${acctBase}/customer-ledger` },
    { name: 'Vendors', path: `${acctBase}/vendors` },
    { name: 'Receivables', path: `${acctBase}/receivables` },
    { name: 'Payables', path: `${acctBase}/payables` },
    { name: 'Cash Book', path: `${acctBase}/cash-book` },
    { name: 'Bank Book', path: `${acctBase}/bank-book` },
    { name: 'Bank Accounts / Transfers', path: `${acctBase}/banks` },
    { name: 'Bank Recon', path: `${acctBase}/reconciliation` },
    { name: 'Invoices', path: `${acctBase}/invoices` },
    { name: 'Trial Balance', path: `${acctBase}/trial-balance` },
    { name: 'Profit & Loss', path: `${acctBase}/profit-loss` },
    { name: 'Balance Sheet', path: `${acctBase}/balance-sheet` },
    { name: 'Cash Flow', path: `${acctBase}/cash-flow` },
    { name: 'Opening Balances', path: `${acctBase}/opening-balances` },
    { name: 'Fiscal Periods', path: `${acctBase}/periods` },
    { name: 'Health Check', path: `${acctBase}/health` },
  ];

  const mainNavItems = isGuestHouse ? guestHouseNavItems : hallNavItems;

  if (loading || !user) {
    return (
      <aside className="app-sidebar app-sidebar--loading">
        <AppLoader inline className="app-loader--compact" message="Loading menu…" />
      </aside>
    );
  }

  const handleNavClick = () => {
    if (isMobile) onMobileClose?.();
  };

  const sidebarClass = [
    'app-sidebar',
    !isMobile && isCollapsed ? 'app-sidebar--collapsed' : '',
    isMobile && isMobileOpen ? 'app-sidebar--mobile-open' : '',
  ].filter(Boolean).join(' ');

  const navLinkClass = (isActive) => [
    'app-sidebar__nav-link',
    isActive ? 'app-sidebar__nav-link--active' : '',
    isCollapsed && !isMobile ? 'app-sidebar__nav-link--collapsed' : '',
  ].filter(Boolean).join(' ');

  const renderNavLink = (item) => (
    <NavLink
      to={item.path}
      title={item.name}
      onClick={handleNavClick}
      className={({ isActive }) => navLinkClass(isActive)}
    >
      <item.icon size={24} className="app-sidebar__nav-icon" aria-hidden />
      {(!isCollapsed || isMobile) && (
        <span className="app-sidebar__nav-label">{item.name}</span>
      )}
    </NavLink>
  );

  return (
    <aside className={sidebarClass}>
      {!isMobile && (
        <button
          type="button"
          className="app-sidebar__collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      )}

      {isMobile && (
        <button
          type="button"
          onClick={onMobileClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '16px',
            background: 'transparent',
            color: '#94a3b8',
            padding: '4px',
          }}
          aria-label="Close menu"
        >
          <X size={22} />
        </button>
      )}

      <div className={`app-sidebar__brand${isCollapsed && !isMobile ? ' app-sidebar__brand--collapsed' : ''}`}>
        <AppLogo
          size={isCollapsed && !isMobile ? 'md' : 'lg'}
          tone="light"
          showName={!isCollapsed || isMobile}
          nameAccent={(!isCollapsed || isMobile) ? 'Centre' : undefined}
          className={isCollapsed && !isMobile ? 'app-logo--sidebar-collapsed' : 'app-logo--sidebar'}
        />
      </div>

      <nav className={`app-sidebar__nav custom-scrollbar${isCollapsed && !isMobile ? ' app-sidebar__nav--collapsed' : ''}`}>
        <ul className="app-sidebar__nav-list">
          {mainNavItems.map((item) => (
            <li key={item.name} className="app-sidebar__nav-item">
              {renderNavLink(item)}
            </li>
          ))}
          {canAccessDashboard && (
            (!dashboardNavItem.pageKey
              || (isGuestHouse
                ? isGhPageVisible(dashboardNavItem.pageKey)
                : isHallPageVisible(dashboardNavItem.pageKey)))
            && (
            <li className="app-sidebar__nav-item app-sidebar__nav-item--divider">
              {renderNavLink(dashboardNavItem)}
            </li>
          ))}
          {canAccessDashboard && (!isCollapsed || isMobile) && (
            <li className={`app-sidebar__nav-item app-sidebar__nav-item--divider app-sidebar__nav-item--accordion${acctOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className={`app-sidebar__nav-link app-sidebar__nav-link--accordion${acctOpen ? ' is-open' : ''}`}
                onClick={() => setAcctOpen((o) => !o)}
                aria-expanded={acctOpen}
                aria-controls="sidebar-accounting-menu"
              >
                <BookOpen size={24} className="app-sidebar__nav-icon" aria-hidden />
                <span className="app-sidebar__nav-label">Accounting</span>
                <ChevronDown
                  size={18}
                  className={`app-sidebar__accordion-chevron${acctOpen ? ' is-open' : ''}`}
                  aria-hidden
                />
              </button>
              {acctOpen && (
                <ul id="sidebar-accounting-menu" className="app-sidebar__submenu" role="list">
                  {accountingLinks.map((link) => (
                    <li key={link.path} className="app-sidebar__submenu-item">
                      <NavLink
                        to={link.path}
                        end={link.path === acctBase}
                        onClick={handleNavClick}
                        className={({ isActive }) => [
                          'app-sidebar__submenu-link',
                          isActive ? 'app-sidebar__submenu-link--active' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {link.name}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
          {canAccessDashboard && isCollapsed && !isMobile && (
            <li className="app-sidebar__nav-item">
              <NavLink to={acctBase} title="Accounting" onClick={handleNavClick} className={({ isActive }) => navLinkClass(isActive)}>
                <BookOpen size={24} className="app-sidebar__nav-icon" aria-hidden />
              </NavLink>
            </li>
          )}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
