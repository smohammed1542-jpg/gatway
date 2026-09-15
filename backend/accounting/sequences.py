"""Tenant-scoped document number sequences (JE, INV, VB, VP)."""
import re

from django.db import transaction

PREFIX = {
    'JE': 'JE',
    'INV': 'INV',
    'VB': 'VB',
    'VP': 'VP',
}


def _parse_numeric_suffix(value, prefix):
    """Extract trailing numeric part from e.g. INV-000003 or JE-42."""
    if not value:
        return 0
    text = str(value).strip().upper()
    prefix = (prefix or '').upper()
    match = re.match(rf'^{re.escape(prefix)}-0*(\d+)$', text)
    if match:
        return int(match.group(1))
    match = re.search(r'(\d+)\s*$', text)
    return int(match.group(1)) if match else 0


def _highest_existing_number(tenant, doc_type):
    """Max numeric suffix already used for this tenant + document type."""
    from accounting.models import Invoice, JournalEntry, VendorBill, VendorPayment

    prefix = PREFIX.get(doc_type, doc_type)
    if doc_type == 'INV':
        values = Invoice.objects.filter(tenant=tenant).exclude(
            invoice_no=''
        ).values_list('invoice_no', flat=True)
    elif doc_type == 'JE':
        values = JournalEntry.objects.filter(tenant=tenant).exclude(
            entry_no=''
        ).values_list('entry_no', flat=True)
    elif doc_type == 'VB':
        values = VendorBill.objects.filter(tenant=tenant).exclude(
            bill_no=''
        ).values_list('bill_no', flat=True)
    elif doc_type == 'VP':
        values = VendorPayment.objects.filter(tenant=tenant).exclude(
            payment_no=''
        ).values_list('payment_no', flat=True)
    else:
        return 0

    highest = 0
    for value in values.iterator(chunk_size=500):
        # Ignore temporary placeholders like TMP-...
        if str(value).upper().startswith('TMP'):
            continue
        n = _parse_numeric_suffix(value, prefix)
        if n > highest:
            highest = n
    return highest


def next_document_no(tenant, doc_type):
    """
    Return next document number for tenant + type, e.g. JE-000042.
    Uses SELECT FOR UPDATE on accounting.DocumentSequence and advances past
    any numbers already present on documents (avoids unique-constraint clashes
    when the counter drifted behind imported/manual rows).
    """
    from accounting.models import DocumentSequence

    if not tenant:
        raise ValueError('tenant is required for document numbering')
    doc_type = (doc_type or 'JE').upper()
    prefix = PREFIX.get(doc_type, doc_type)

    with transaction.atomic():
        seq, _ = DocumentSequence.objects.select_for_update().get_or_create(
            tenant=tenant,
            doc_type=doc_type,
            defaults={'last_number': 0},
        )
        highest = _highest_existing_number(tenant, doc_type)
        if seq.last_number < highest:
            seq.last_number = highest
        seq.last_number += 1
        seq.save(update_fields=['last_number', 'updated_at'])
        return f'{prefix}-{seq.last_number:06d}'


def seed_sequence_from_existing(tenant, doc_type, highest: int):
    """Migration helper: ensure sequence is at least highest existing numeric suffix."""
    from accounting.models import DocumentSequence

    if not tenant or highest <= 0:
        return
    seq, created = DocumentSequence.objects.get_or_create(
        tenant=tenant,
        doc_type=doc_type.upper(),
        defaults={'last_number': highest},
    )
    if not created and seq.last_number < highest:
        seq.last_number = highest
        seq.save(update_fields=['last_number', 'updated_at'])
