from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0011_bookkeeping_module'),
        ('core', '0010_erp_alignment'),
    ]

    operations = [
        migrations.AlterModelTable(
            name='booking',
            table='bookings',
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(fields=['tenant', 'booking_status'], name='bookings_tenant_status_idx'),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(fields=['tenant', 'event_date'], name='bookings_tenant_event_idx'),
        ),
        migrations.AddIndex(
            model_name='booking',
            index=models.Index(fields=['customer'], name='bookings_customer_idx'),
        ),
    ]
