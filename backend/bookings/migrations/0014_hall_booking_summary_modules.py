from django.db import migrations

DEFAULT_HALL_MODULES = (
    ('booking_summary_bill', 'Booking summary bill lines', 5),
    ('summary_guests', 'Guaranteed Guests (booking bill)', 6),
    ('summary_rate_per_head', 'Rate / Head (booking bill)', 7),
    ('summary_food_venue', 'Food & Venue (booking bill)', 8),
    ('summary_combined_services', 'Combined Services (booking bill)', 9),
    ('summary_tax', 'Tax / GST (booking bill)', 10),
)

TENANT_SUMMARY_FIELD_BY_MODULE = {
    'summary_guests': 'show_summary_guests',
    'summary_rate_per_head': 'show_summary_rate_per_head',
    'summary_food_venue': 'show_summary_food_venue',
    'summary_combined_services': 'show_summary_combined_services',
    'summary_tax': 'show_summary_tax',
}


def seed_hall_summary_modules(apps, schema_editor):
    Tenant = apps.get_model('core', 'Tenant')
    MarriageHallPageVisibility = apps.get_model('bookings', 'MarriageHallPageVisibility')

    for tenant in Tenant.objects.all():
        for page_key, label, sort_order in DEFAULT_HALL_MODULES:
            tenant_field = TENANT_SUMMARY_FIELD_BY_MODULE.get(page_key)
            default_visible = getattr(tenant, tenant_field, True) if tenant_field else True
            MarriageHallPageVisibility.objects.get_or_create(
                tenant=tenant,
                page_key=page_key,
                defaults={
                    'label': label,
                    'sort_order': sort_order,
                    'is_visible': default_visible,
                },
            )


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0013_booking_custom_times'),
        ('core', '0011_tenant_booking_summary_visibility'),
    ]

    operations = [
        migrations.RunPython(seed_hall_summary_modules, migrations.RunPython.noop),
    ]
