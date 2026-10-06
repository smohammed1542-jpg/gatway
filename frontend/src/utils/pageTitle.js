const SETTINGS_TABS = {
  halls: 'Halls',
  rooms: 'Units',
  staff: 'Staff',
  records: 'All Records',
  services: 'Add-on Services',
  profile: 'Settings',
  venue: 'Venue Info',
  notifications: 'Notifications',
  security: 'Security',
  system: 'System',
};

const ROUTE_TITLES = [
  [/^\/gh\/payments\/new$/, 'Record Payment'],
  [/^\/gh\/payments\/[^/]+\/edit$/, 'Edit Payment'],
  [/^\/gh\/expenses\/new$/, 'New Expense'],
  [/^\/gh\/expenses\/[^/]+\/edit$/, 'Edit Expense'],
  [/^\/gh\/expenses\/[^/]+$/, 'Expense Detail'],
  [/^\/gh\/rooms\/new$/, 'New Room'],
  [/^\/gh\/rooms\/[^/]+\/edit$/, 'Edit Room'],
  [/^\/gh\/stays\/[^/]+\/edit$/, 'Edit Stay'],
  [/^\/gh\/stays\/[^/]+$/, 'Stay Detail'],
  [/^\/gh\/book$/, 'Reservation'],
  [/^\/gh\/dashboard$/, 'Dashboard'],
  [/^\/gh\/stays$/, 'Stays'],
  [/^\/gh\/calendar$/, 'Calendar'],
  [/^\/gh\/customers\/[^/]+$/, 'Guest Detail'],
  [/^\/gh\/customers$/, 'Guests'],
  [/^\/gh\/services$/, 'Add-on Services'],
  [/^\/gh\/payments$/, 'Payments'],
  [/^\/gh\/expenses$/, 'Expenses'],
  [/^\/gh\/reports$/, 'Reports'],
  [/^\/gh\/notifications$/, 'Notifications'],
  [/^\/gh\/profile$/, 'Profile'],
  [/^\/gh\/settings$/, 'Settings'],
  [/^\/halls\/new$/, 'New Hall'],
  [/^\/halls\/[^/]+\/edit$/, 'Edit Hall'],
  [/^\/bookings\/[^/]+$/, 'Booking Detail'],
  [/^\/dashboard$/, 'Accountant'],
  [/^\/bookings$/, 'Bookings'],
  [/^\/calendar$/, 'Calendar'],
  [/^\/customers\/[^/]+$/, 'Customer Detail'],
  [/^\/customers$/, 'Customers'],
  [/^\/payments$/, 'Payments'],
  [/^\/expenses\/[^/]+$/, 'Expense Detail'],
  [/^\/expenses$/, 'Expenses'],
  [/^\/inventory\/[^/]+$/, 'Inventory Detail'],
  [/^\/inventory$/, 'Inventory'],
  [/^\/services$/, 'Services'],
  [/^\/decoration-packages\/[^/]+$/, 'Decoration Detail'],
  [/^\/decoration-packages$/, 'Decorations'],
  [/^\/reports$/, 'Reports'],
  [/^\/notifications$/, 'Notifications'],
  [/^\/profile$/, 'Profile'],
  [/^\/settings$/, 'Settings'],
];

export function getPageTitle(pathname, search = '') {
  const path = (pathname || '/').replace(/\/$/, '') || '/';
  const params = new URLSearchParams(
    typeof search === 'string' && search.startsWith('?') ? search.slice(1) : search,
  );

  if (path === '/settings' || path === '/gh/settings') {
    const tab = params.get('tab');
    if (tab && SETTINGS_TABS[tab]) return SETTINGS_TABS[tab];
    return 'Settings';
  }

  for (const [pattern, title] of ROUTE_TITLES) {
    if (pattern.test(path)) return title;
  }

  return 'Gateway Centre';
}
