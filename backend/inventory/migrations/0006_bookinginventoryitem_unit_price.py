from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0005_bookinginventoryitem_include_in_bill'),
    ]

    operations = [
        migrations.AddField(
            model_name='bookinginventoryitem',
            name='unit_price',
            field=models.DecimalField(decimal_places=2, default=0.00, max_digits=10),
        ),
    ]
