import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_erp_alignment'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('accounting', '0004_hardening_constraints'),
    ]

    operations = [
        migrations.CreateModel(
            name='CostCenter',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=20)),
                ('name', models.CharField(max_length=120)),
                ('kind', models.CharField(
                    choices=[('COST', 'Cost center'), ('PROFIT', 'Profit center')],
                    default='COST',
                    max_length=10,
                )),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='cost_centers',
                    to='core.tenant',
                )),
            ],
            options={
                'db_table': 'cost_centers',
                'ordering': ['code'],
                'unique_together': {('tenant', 'code')},
            },
        ),
        migrations.CreateModel(
            name='DocumentSequence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('doc_type', models.CharField(max_length=10)),
                ('last_number', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='document_sequences',
                    to='core.tenant',
                )),
            ],
            options={
                'db_table': 'document_sequences',
                'unique_together': {('tenant', 'doc_type')},
            },
        ),
        migrations.AddField(
            model_name='journalline',
            name='cost_center',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='journal_lines',
                to='accounting.costcenter',
            ),
        ),
        migrations.AddField(
            model_name='journalline',
            name='profit_center',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='profit_journal_lines',
                to='accounting.costcenter',
            ),
        ),
        migrations.AlterField(
            model_name='auditlog',
            name='action',
            field=models.CharField(
                choices=[
                    ('POST', 'Post'),
                    ('REVERSE', 'Reverse'),
                    ('VOID', 'Void'),
                    ('CREATE', 'Create'),
                    ('UPDATE', 'Update'),
                    ('APPROVE', 'Approve'),
                    ('CLOSE', 'Close period'),
                    ('REOPEN', 'Reopen period'),
                    ('DEACTIVATE', 'Deactivate'),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='journalentry',
            name='source_type',
            field=models.CharField(
                choices=[
                    ('booking', 'Sales invoice (booking)'),
                    ('stay', 'Sales invoice (stay)'),
                    ('payment', 'Incoming payment'),
                    ('stay_payment', 'Stay payment'),
                    ('expense', 'Expense'),
                    ('gh_expense', 'Guest house expense'),
                    ('vendor_bill', 'Vendor bill'),
                    ('vendor_payment', 'Vendor payment'),
                    ('transfer', 'Bank/cash transfer'),
                    ('opening', 'Opening balance'),
                    ('invoice', 'Customer invoice'),
                    ('reversal', 'Reversal'),
                    ('manual', 'Manual'),
                    ('adjustment', 'Adjustment'),
                    ('inventory', 'Inventory movement'),
                ],
                default='manual',
                max_length=20,
            ),
        ),
    ]
