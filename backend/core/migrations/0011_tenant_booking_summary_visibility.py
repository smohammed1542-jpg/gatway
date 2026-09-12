from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_erp_alignment'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='show_summary_combined_services',
            field=models.BooleanField(
                default=True,
                help_text='Show "Combined Services" on the booking summary panel.',
            ),
        ),
        migrations.AddField(
            model_name='tenant',
            name='show_summary_food_venue',
            field=models.BooleanField(
                default=True,
                help_text='Show "Food & Venue" on the booking summary panel.',
            ),
        ),
        migrations.AddField(
            model_name='tenant',
            name='show_summary_guests',
            field=models.BooleanField(
                default=True,
                help_text='Show "Guaranteed Guests" on the booking summary panel.',
            ),
        ),
        migrations.AddField(
            model_name='tenant',
            name='show_summary_rate_per_head',
            field=models.BooleanField(
                default=True,
                help_text='Show "Rate / Head" on the booking summary panel.',
            ),
        ),
        migrations.AddField(
            model_name='tenant',
            name='show_summary_tax',
            field=models.BooleanField(
                default=True,
                help_text='Show "Tax (GST)" on the booking summary panel.',
            ),
        ),
    ]
