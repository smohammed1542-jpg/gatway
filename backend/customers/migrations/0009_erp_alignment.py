from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0008_erp_accounting_audit'),
    ]

    operations = [
        migrations.AlterModelTable(
            name='customer',
            table='customers',
        ),
        migrations.AddIndex(
            model_name='customer',
            index=models.Index(fields=['tenant', 'phone'], name='customers_tenant_phone_idx'),
        ),
        migrations.AddIndex(
            model_name='customer',
            index=models.Index(fields=['tenant', 'email'], name='customers_tenant_email_idx'),
        ),
    ]
