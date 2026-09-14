from django.db import migrations, models


def empty_slot_to_null(apps, schema_editor):
    Booking = apps.get_model('bookings', 'Booking')
    Booking.objects.filter(slot='').update(slot=None)


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0018_booking_draft_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='slot',
            field=models.CharField(
                blank=True,
                choices=[('morning', 'Morning'), ('evening', 'Evening'), ('custom', 'Custom time')],
                default=None,
                max_length=20,
                null=True,
            ),
        ),
        migrations.RunPython(empty_slot_to_null, migrations.RunPython.noop),
    ]
