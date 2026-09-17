"""Default Marriage Hall pages, in-app modules, and tenant seeding helpers."""

DEFAULT_HALL_PAGES = (
    ('dashboard', 'Accountant / Dashboard', 10),
    ('bookings', 'Bookings', 20),
    ('calendar', 'Calendar', 30),
    ('customers', 'Customers', 40),
    ('payments', 'Payments', 50),
    ('expenses', 'Expenses', 60),
    ('inventory', 'Inventory', 70),
    ('decorations', 'Decoration Packages', 80),
    ('reports', 'Reports', 90),
    ('notifications', 'Notifications', 100),
    ('halls', 'Hall Management', 110),
    ('staff', 'Staff', 120),
    ('profile', 'Profile', 130),
    ('settings', 'Settings', 140),
)

# Booking summary bill lines — toggled from Django admin “Book Summary”.
DEFAULT_HALL_MODULES = (
    ('summary_guests', 'Guaranteed Guests', 1),
    ('summary_rate_per_head', 'Rate / Head', 2),
    ('summary_food_venue', 'Venue', 3),
    ('summary_combined_services', 'Combined Services', 4),
    ('summary_tax', 'Tax (5% GST)', 5),
    ('summary_inventory', 'Inventory items', 6),
)

HALL_MODULE_KEYS = frozenset(key for key, _label, _order in DEFAULT_HALL_MODULES)
HALL_PAGE_KEYS = frozenset(key for key, _label, _order in DEFAULT_HALL_PAGES)

_TENANT_SUMMARY_FIELD_BY_MODULE = {
    'summary_guests': 'show_summary_guests',
    'summary_rate_per_head': 'show_summary_rate_per_head',
    'summary_food_venue': 'show_summary_food_venue',
    'summary_combined_services': 'show_summary_combined_services',
    'summary_tax': 'show_summary_tax',
}


def sync_tenant_book_summary(tenant):
    """Keep Book Summary rows in sync with tenant.show_summary_* flags."""
    from .models import MarriageHallPageVisibility

    if not tenant:
        return
    ensure_tenant_hall_pages(tenant)
    for page_key, field in _TENANT_SUMMARY_FIELD_BY_MODULE.items():
        visible = bool(getattr(tenant, field, True))
        MarriageHallPageVisibility.objects.filter(
            tenant=tenant,
            page_key=page_key,
        ).update(is_visible=visible)


def ensure_tenant_hall_pages(tenant):
    """Create missing Marriage Hall page and Book Summary module rows for a tenant."""
    from .models import MarriageHallPageVisibility

    if not tenant:
        return
    for page_key, label, sort_order in DEFAULT_HALL_PAGES:
        MarriageHallPageVisibility.objects.get_or_create(
            tenant=tenant,
            page_key=page_key,
            defaults={
                'label': label,
                'sort_order': sort_order,
                'is_visible': True,
            },
        )
    for page_key, label, sort_order in DEFAULT_HALL_MODULES:
        tenant_field = _TENANT_SUMMARY_FIELD_BY_MODULE.get(page_key)
        default_visible = getattr(tenant, tenant_field, True) if tenant_field else True
        row, created = MarriageHallPageVisibility.objects.get_or_create(
            tenant=tenant,
            page_key=page_key,
            defaults={
                'label': label,
                'sort_order': sort_order,
                'is_visible': default_visible,
            },
        )
        if not created and (row.label != label or row.sort_order != sort_order):
            row.label = label
            row.sort_order = sort_order
            row.save(update_fields=['label', 'sort_order'])
