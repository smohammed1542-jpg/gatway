from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0004_erp_accounting_audit'),
    ]

    operations = [
        migrations.AddField(
            model_name='bookinginventoryitem',
            name='include_in_bill',
            field=models.BooleanField(
                default=False,
                help_text='When true, the item unit price is added to the booking bill (quantity is for stock only).',
            ),
        ),
    ]
