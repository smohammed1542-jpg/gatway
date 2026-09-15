import re

from django.db import migrations


def _parse_suffix(value, prefix):
    if not value:
        return 0
    text = str(value).strip().upper()
    match = re.match(rf'^{re.escape(prefix)}-0*(\d+)$', text)
    if match:
        return int(match.group(1))
    match = re.search(r'(\d+)\s*$', text)
    return int(match.group(1)) if match else 0


def sync_document_sequences(apps, schema_editor):
    """Bump DocumentSequence counters past any numbers already on documents."""
    DocumentSequence = apps.get_model('accounting', 'DocumentSequence')
    Invoice = apps.get_model('accounting', 'Invoice')
    JournalEntry = apps.get_model('accounting', 'JournalEntry')
    VendorBill = apps.get_model('accounting', 'VendorBill')
    VendorPayment = apps.get_model('accounting', 'VendorPayment')
    Tenant = apps.get_model('core', 'Tenant')

    sources = (
        ('INV', 'INV', Invoice, 'invoice_no'),
        ('JE', 'JE', JournalEntry, 'entry_no'),
        ('VB', 'VB', VendorBill, 'bill_no'),
        ('VP', 'VP', VendorPayment, 'payment_no'),
    )

    for tenant in Tenant.objects.all().iterator():
        for doc_type, prefix, model, field in sources:
            highest = 0
            for value in model.objects.filter(tenant_id=tenant.pk).exclude(
                **{f'{field}': ''}
            ).values_list(field, flat=True).iterator(chunk_size=500):
                if str(value).upper().startswith('TMP'):
                    continue
                n = _parse_suffix(value, prefix)
                if n > highest:
                    highest = n
            if highest <= 0:
                continue
            seq, created = DocumentSequence.objects.get_or_create(
                tenant_id=tenant.pk,
                doc_type=doc_type,
                defaults={'last_number': highest},
            )
            if not created and seq.last_number < highest:
                seq.last_number = highest
                seq.save(update_fields=['last_number', 'updated_at'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('accounting', '0006_reopen_closed_fiscal_periods'),
    ]

    operations = [
        migrations.RunPython(sync_document_sequences, noop_reverse),
    ]
