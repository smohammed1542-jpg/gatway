from django.db import migrations

REMOVED_MODULE_KEYS = (
    'booking_summary_bill',
    'summary_guests',
    'summary_rate_per_head',
    'summary_food_venue',
    'summary_combined_services',
)


def keep_only_summary_tax(apps, schema_editor):
    MarriageHallPageVisibility = apps.get_model('bookings', 'MarriageHallPageVisibility')
    Tenant = apps.get_model('core', 'Tenant')

    MarriageHallPageVisibility.objects.filter(page_key__in=REMOVED_MODULE_KEYS).delete()

    for tenant in Tenant.objects.all():
        MarriageHallPageVisibility.objects.get_or_create(
            tenant=tenant,
            page_key='summary_tax',
            defaults={
                'label': 'Tax / GST (booking bill)',
                'sort_order': 5,
                'is_visible': getattr(tenant, 'show_summary_tax', True),
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0014_hall_booking_summary_modules'),
    ]

    operations = [
        migrations.RunPython(keep_only_summary_tax, migrations.RunPython.noop),
    ]
