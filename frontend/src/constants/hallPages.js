/** Marriage Hall page keys — must match backend `DEFAULT_HALL_PAGES`. */
/** In-app modules (not sidebar routes) — toggled from Django admin Book Summary. */
export const HALL_MODULE_KEYS = {
  SUMMARY_GUESTS: 'summary_guests',
  SUMMARY_RATE_PER_HEAD: 'summary_rate_per_head',
  SUMMARY_FOOD_VENUE: 'summary_food_venue',
  SUMMARY_COMBINED_SERVICES: 'summary_combined_services',
  SUMMARY_TAX: 'summary_tax',
  SUMMARY_INVENTORY: 'summary_inventory',
};

/** Fallback copy for known bill lines. Settings lists every module from the API. */
export const HALL_SUMMARY_LINES = [
  { field: 'show_summary_guests', module: HALL_MODULE_KEYS.SUMMARY_GUESTS, title: 'Guaranteed Guests', desc: 'Show guest count on the booking bill summary.' },
  { field: 'show_summary_rate_per_head', module: HALL_MODULE_KEYS.SUMMARY_RATE_PER_HEAD, title: 'Rate / Head', desc: 'Show per-person rate after a hall is selected.' },
  { field: 'show_summary_food_venue', module: HALL_MODULE_KEYS.SUMMARY_FOOD_VENUE, title: 'Venue', desc: 'Show hall / food venue amount on the summary.' },
  { field: 'show_summary_combined_services', module: HALL_MODULE_KEYS.SUMMARY_COMBINED_SERVICES, title: 'Combined Services', desc: 'Show overtime, kitchen, décor, and add-ons total.' },
  { field: 'show_summary_tax', module: HALL_MODULE_KEYS.SUMMARY_TAX, title: 'Tax (GST)', desc: 'Show tax line on the booking summary.' },
  { field: null, module: HALL_MODULE_KEYS.SUMMARY_INVENTORY, title: 'Inventory items', desc: 'Show billed inventory lines on the booking summary.' },
];

export const HALL_PAGE_KEYS = {
  DASHBOARD: 'dashboard',
  BOOKINGS: 'bookings',
  CALENDAR: 'calendar',
  CUSTOMERS: 'customers',
  PAYMENTS: 'payments',
  EXPENSES: 'expenses',
  INVENTORY: 'inventory',
  DECORATIONS: 'decorations',
  REPORTS: 'reports',
  NOTIFICATIONS: 'notifications',
  HALLS: 'halls',
  STAFF: 'staff',
  PROFILE: 'profile',
  SETTINGS: 'settings',
};

export const HALL_PAGE_LABELS = {
  [HALL_PAGE_KEYS.DASHBOARD]: 'Financials',
  [HALL_PAGE_KEYS.BOOKINGS]: 'Bookings',
  [HALL_PAGE_KEYS.CALENDAR]: 'Calendar',
  [HALL_PAGE_KEYS.CUSTOMERS]: 'Customers',
  [HALL_PAGE_KEYS.PAYMENTS]: 'Payments',
  [HALL_PAGE_KEYS.EXPENSES]: 'Expenses',
  [HALL_PAGE_KEYS.INVENTORY]: 'Inventory',
  [HALL_PAGE_KEYS.DECORATIONS]: 'Decoration Packages',
  [HALL_PAGE_KEYS.REPORTS]: 'Reports',
  [HALL_PAGE_KEYS.NOTIFICATIONS]: 'Notifications',
  [HALL_PAGE_KEYS.HALLS]: 'Hall Management',
  [HALL_PAGE_KEYS.STAFF]: 'Staff',
  [HALL_PAGE_KEYS.PROFILE]: 'Profile',
  [HALL_PAGE_KEYS.SETTINGS]: 'Settings',
};

export const HALL_PAGE_PATHS = {
  [HALL_PAGE_KEYS.DASHBOARD]: '/dashboard',
  [HALL_PAGE_KEYS.BOOKINGS]: '/bookings',
  [HALL_PAGE_KEYS.CALENDAR]: '/calendar',
  [HALL_PAGE_KEYS.CUSTOMERS]: '/customers',
  [HALL_PAGE_KEYS.PAYMENTS]: '/payments',
  [HALL_PAGE_KEYS.EXPENSES]: '/expenses',
  [HALL_PAGE_KEYS.INVENTORY]: '/inventory',
  [HALL_PAGE_KEYS.DECORATIONS]: '/decoration-packages',
  [HALL_PAGE_KEYS.REPORTS]: '/reports',
  [HALL_PAGE_KEYS.NOTIFICATIONS]: '/notifications',
  [HALL_PAGE_KEYS.HALLS]: '/settings?tab=halls',
  [HALL_PAGE_KEYS.STAFF]: '/settings?tab=staff',
  [HALL_PAGE_KEYS.PROFILE]: '/profile',
  [HALL_PAGE_KEYS.SETTINGS]: '/settings',
};

export const HALL_PAGE_ORDER = [
  HALL_PAGE_KEYS.DASHBOARD,
  HALL_PAGE_KEYS.BOOKINGS,
  HALL_PAGE_KEYS.CALENDAR,
  HALL_PAGE_KEYS.CUSTOMERS,
  HALL_PAGE_KEYS.PAYMENTS,
  HALL_PAGE_KEYS.EXPENSES,
  HALL_PAGE_KEYS.INVENTORY,
  HALL_PAGE_KEYS.DECORATIONS,
  HALL_PAGE_KEYS.REPORTS,
  HALL_PAGE_KEYS.NOTIFICATIONS,
  HALL_PAGE_KEYS.HALLS,
  HALL_PAGE_KEYS.STAFF,
  HALL_PAGE_KEYS.PROFILE,
  HALL_PAGE_KEYS.SETTINGS,
];
