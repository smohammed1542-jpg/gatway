import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def backfill_finance_tenant(apps, schema_editor):
    Payment = apps.get_model('finance', 'Payment')
    Expense = apps.get_model('finance', 'Expense')
    Tenant = apps.get_model('core', 'Tenant')

    default_tenant = Tenant.objects.order_by('id').first()
    for payment in Payment.objects.filter(tenant__isnull=True).select_related('booking'):
        tenant_id = None
        if payment.booking_id:
            booking = payment.booking
            tenant_id = getattr(booking, 'tenant_id', None)
        if not tenant_id and default_tenant:
            tenant_id = default_tenant.id
        if tenant_id:
            Payment.objects.filter(pk=payment.pk).update(tenant_id=tenant_id)

    for expense in Expense.objects.filter(tenant__isnull=True):
        tenant_id = default_tenant.id if default_tenant else None
        if tenant_id:
            Expense.objects.filter(pk=expense.pk).update(tenant_id=tenant_id)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_erp_alignment'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finance', '0006_hardening_constraints'),
    ]

    operations = [
        migrations.RunPython(backfill_finance_tenant, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='payment',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='payments',
                to='core.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='expense',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='expenses',
                to='core.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='payment',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AddField(
            model_name='payment',
            name='updated_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='payments_updated',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterModelTable(
            name='payment',
            table='payments',
        ),
        migrations.AlterModelTable(
            name='expense',
            table='expenses',
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['tenant', 'status'], name='payments_tenant_status_idx'),
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['tenant', 'payment_date'], name='payments_tenant_date_idx'),
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['booking'], name='payments_booking_idx'),
        ),
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['tenant', 'status'], name='expenses_tenant_status_idx'),
        ),
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['tenant', 'expense_date'], name='expenses_tenant_date_idx'),
        ),
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['account'], name='expenses_account_idx'),
        ),
        migrations.AlterField(
            model_name='payment',
            name='receipt_no',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
    ]
