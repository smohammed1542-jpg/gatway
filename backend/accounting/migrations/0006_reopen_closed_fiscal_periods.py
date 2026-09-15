from django.db import migrations


def reopen_closed_periods(apps, schema_editor):
    FiscalPeriod = apps.get_model('accounting', 'FiscalPeriod')
    FiscalPeriod.objects.filter(is_closed=True).update(is_closed=False)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('accounting', '0005_erp_alignment'),
    ]

    operations = [
        migrations.RunPython(reopen_closed_periods, noop_reverse),
    ]
