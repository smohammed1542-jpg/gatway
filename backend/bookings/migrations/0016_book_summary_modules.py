from django.db import migrations

DEFAULT_HALL_MODULES = (
    ('summary_guests', 'Guaranteed Guests', 1),
    ('summary_rate_per_head', 'Rate / Head', 2),
    ('summary_food_venue', 'Venue', 3),
    ('summary_combined_services', 'Combined Services', 4),
    ('summary_tax', 'Tax (5% GST)', 5),
)

TENANT_SUMMARY_FIELD_BY_MODULE = {
    'summary_guests': 'show_summary_guests',
    'summary_rate_per_head': 'show_summary_rate_per_head',
    'summary_food_venue': 'show_summary_food_venue',
    'summary_combined_services': 'show_summary_combined_services',
    'summary_tax': 'show_summary_tax',
}


def seed_book_summary_modules(apps, schema_editor):
    Tenant = apps.get_model('core', 'Tenant')
    MarriageHallPageVisibility = apps.get_model('bookings', 'MarriageHallPageVisibility')

    for tenant in Tenant.objects.all():
        for page_key, label, sort_order in DEFAULT_HALL_MODULES:
            tenant_field = TENANT_SUMMARY_FIELD_BY_MODULE.get(page_key)
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
            if not created:
                row.label = label
                row.sort_order = sort_order
                row.save(update_fields=['label', 'sort_order'])


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0015_keep_only_summary_tax_module'),
    ]

    operations = [
        migrations.CreateModel(
            name='MarriageHallBookSummary',
            fields=[],
            options={
                'verbose_name': 'Book Summary line',
                'verbose_name_plural': '3 · Book Summary — hide / show lines',
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('bookings.marriagehallpagevisibility',),
        ),
        migrations.RunPython(seed_book_summary_modules, migrations.RunPython.noop),
    ]
