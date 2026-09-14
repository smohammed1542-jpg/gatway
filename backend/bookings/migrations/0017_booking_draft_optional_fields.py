from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0016_book_summary_modules'),
        ('customers', '0001_initial'),
        ('venues', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='booking',
            name='customer',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='bookings',
                to='customers.customer',
            ),
        ),
        migrations.AlterField(
            model_name='booking',
            name='venue',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='bookings',
                to='venues.venue',
            ),
        ),
        migrations.AlterField(
            model_name='booking',
            name='event_name',
            field=models.CharField(blank=True, default='Draft', max_length=255),
        ),
        migrations.AlterField(
            model_name='booking',
            name='slot',
            field=models.CharField(
                blank=True,
                choices=[('morning', 'Morning'), ('evening', 'Evening'), ('custom', 'Custom time')],
                default='',
                max_length=20,
            ),
        ),
    ]
