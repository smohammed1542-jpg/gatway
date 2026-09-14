from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0019_booking_slot_null'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='slot',
            field=models.CharField(
                blank=True,
                choices=[
                    ('', 'Not set'),
                    ('morning', 'Morning'),
                    ('evening', 'Evening'),
                    ('custom', 'Custom time'),
                ],
                default=None,
                max_length=20,
                null=True,
            ),
        ),
    ]
