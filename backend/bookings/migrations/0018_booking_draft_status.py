from django.db import migrations, models
from django.db.models import Q


def promote_incomplete_pending_to_draft(apps, schema_editor):
    Booking = apps.get_model('bookings', 'Booking')
    Booking.objects.filter(booking_status='PENDING').filter(
        Q(customer__isnull=True)
        | Q(venue__isnull=True)
        | Q(event_name__iexact='Draft')
    ).update(booking_status='DRAFT')


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0017_booking_draft_optional_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='booking_status',
            field=models.CharField(
                choices=[
                    ('DRAFT', 'Draft'),
                    ('PENDING', 'Pending'),
                    ('CONFIRMED', 'Confirmed'),
                    ('COMPLETED', 'Completed'),
                    ('CANCELLED', 'Cancelled'),
                ],
                default='PENDING',
                max_length=20,
            ),
        ),
        migrations.RunPython(promote_incomplete_pending_to_draft, migrations.RunPython.noop),
    ]
