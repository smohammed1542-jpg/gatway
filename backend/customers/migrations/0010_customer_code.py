from django.db import migrations, models


def backfill_customer_codes(apps, schema_editor):
    Customer = apps.get_model('customers', 'Customer')
    by_tenant = {}
    for customer in Customer.objects.order_by('id').iterator():
        by_tenant.setdefault(customer.tenant_id, []).append(customer)
    for rows in by_tenant.values():
        for index, customer in enumerate(rows, start=1):
            customer.customer_code = f'cust-{index:05d}'
            customer.save(update_fields=['customer_code'])


def clear_customer_codes(apps, schema_editor):
    Customer = apps.get_model('customers', 'Customer')
    Customer.objects.update(customer_code='')


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0009_erp_alignment'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='customer_code',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.RunPython(backfill_customer_codes, clear_customer_codes),
        migrations.AddIndex(
            model_name='customer',
            index=models.Index(fields=['tenant', 'customer_code'], name='customers_tenant_code_idx'),
        ),
        migrations.AddConstraint(
            model_name='customer',
            constraint=models.UniqueConstraint(
                condition=models.Q(('customer_code', ''), _negated=True),
                fields=('tenant', 'customer_code'),
                name='uniq_tenant_customer_code',
            ),
        ),
    ]
