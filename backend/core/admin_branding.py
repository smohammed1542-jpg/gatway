"""Gateway Centre Django admin branding, ordering, and readability."""

from django.contrib import admin

ADMIN_APP_ORDER = [
    'core',
    'authentication',
    'guesthouse',
    'bookings',
    'customers',
    'finance',
    'venues',
    'inventory',
    'decorations',
    'landing',
]

ADMIN_MODEL_ORDER = {
    'core': ['tenant', 'usersettings', 'notificationlog'],
    'authentication': ['user', 'staffprofile'],
    'guesthouse': [
        'guesthousepagelive',
        'guesthousepagemaintenance',
        'room',
        'guesthouseservice',
        'staybooking',
        'staypayment',
        'ghexpense',
        'staycharge',
    ],
    'bookings': [
        'marriagehallpagelive',
        'marriagehallpagemaintenance',
        'marriagehallbooksummary',
        'booking',
    ],
    'customers': ['customer'],
    'finance': ['payment', 'expense'],
    'venues': ['venue'],
    'inventory': ['inventoryitem', 'bookinginventoryitem'],
    'decorations': ['decorationpackage'],
    'landing': ['heroslide', 'galleryimage', 'testimonial', 'landingstatistic', 'landingfaq'],
}

ADMIN_APP_LABELS = {
    'core': '01 — Platform & tenants',
    'authentication': '02 — Users & staff',
    'guesthouse': '03 — Guest House app',
    'bookings': '04 — Marriage Hall app',
    'customers': '05 — Customers (shared)',
    'finance': '06 — Finance & payments',
    'venues': '07 — Venues & halls',
    'inventory': '08 — Inventory',
    'decorations': '09 — Decoration packages',
    'landing': '10 — Public website (landing page)',
}


def _model_sort_key(app_label, object_name):
    order = ADMIN_MODEL_ORDER.get(app_label, [])
    try:
        return order.index(object_name)
    except ValueError:
        return len(order) + 1


def configure_admin_site():
    admin.site.site_header = 'Gateway Centre — Admin'
    admin.site.site_title = 'Gateway Centre'
    admin.site.index_title = (
        'Choose a section below. Page show/hide and maintenance are listed first '
        'under Guest House and Marriage Hall.'
    )

    original_get_app_list = admin.site.get_app_list

    def get_app_list(request, app_label=None):
        app_list = original_get_app_list(request, app_label=app_label)
        if app_label:
            return app_list

        for app in app_list:
            label = app.get('app_label', '')
            if label in ADMIN_APP_LABELS:
                app['name'] = ADMIN_APP_LABELS[label]
            app['models'].sort(
                key=lambda m: _model_sort_key(label, m.get('object_name', '')),
            )

        order_map = {name: idx for idx, name in enumerate(ADMIN_APP_ORDER)}
        app_list.sort(key=lambda a: order_map.get(a.get('app_label', ''), 99))
        return app_list

    admin.site.get_app_list = get_app_list
