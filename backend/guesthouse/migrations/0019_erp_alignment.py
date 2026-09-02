import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0005_erp_alignment'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('guesthouse', '0018_erp_accounting_audit'),
    ]

    operations = [
        migrations.AddField(
            model_name='ghexpense',
            name='account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='gh_expenses',
                to='accounting.account',
            ),
        ),
        migrations.AddField(
            model_name='ghexpense',
            name='bank_account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='gh_expenses',
                to='accounting.bankaccount',
            ),
        ),
        migrations.AddField(
            model_name='ghexpense',
            name='paid_through',
            field=models.CharField(
                choices=[('CASH', 'Cash'), ('BANK', 'Bank'), ('AP', 'Accounts Payable')],
                default='CASH',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='ghexpense',
            name='vendor',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='gh_expenses',
                to='accounting.vendor',
            ),
        ),
        migrations.AddField(
            model_name='ghexpense',
            name='updated_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='gh_expenses_updated',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterModelTable(
            name='ghexpense',
            table='gh_expenses',
        ),
        migrations.AddIndex(
            model_name='ghexpense',
            index=models.Index(fields=['tenant', 'status'], name='gh_expenses_tenant_status_idx'),
        ),
        migrations.AddIndex(
            model_name='ghexpense',
            index=models.Index(fields=['tenant', 'expense_date'], name='gh_expenses_tenant_date_idx'),
        ),
    ]
