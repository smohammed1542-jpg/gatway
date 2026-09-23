from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0010_customer_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='is_archived',
            field=models.BooleanField(default=False),
        ),
    ]
