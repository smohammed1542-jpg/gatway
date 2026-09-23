from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0020_booking_slot_blank_choice'),
        ('venues', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='booking',
            name='additional_venues',
            field=models.ManyToManyField(
                blank=True,
                related_name='extra_bookings',
                to='venues.venue',
            ),
        ),
    ]
