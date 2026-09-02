from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_erp_accounting_audit'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='auto_post_journals',
            field=models.BooleanField(
                default=True,
                help_text='When False, operational events create DRAFT journals for manual posting.',
            ),
        ),
    ]
