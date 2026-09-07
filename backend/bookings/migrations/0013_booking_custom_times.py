from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('bookings', '0012_erp_alignment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='slot',
            field=models.CharField(
                choices=[
                    ('morning', 'Morning'),
                    ('evening', 'Evening'),
                    ('custom', 'Custom time'),
                ],
                default='morning',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='booking',
            name='custom_start_time',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='booking',
            name='custom_end_time',
            field=models.TimeField(blank=True, null=True),
        ),
    ]
