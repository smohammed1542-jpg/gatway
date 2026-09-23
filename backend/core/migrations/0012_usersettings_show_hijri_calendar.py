from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_tenant_booking_summary_visibility'),
    ]

    operations = [
        migrations.AddField(
            model_name='usersettings',
            name='show_hijri_calendar',
            field=models.BooleanField(default=True),
        ),
    ]
