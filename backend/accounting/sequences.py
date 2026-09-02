"""Tenant-scoped document number sequences (JE, INV, VB, VP)."""
from django.db import transaction

PREFIX = {
    'JE': 'JE',
    'INV': 'INV',
    'VB': 'VB',
    'VP': 'VP',
}


def next_document_no(tenant, doc_type):
    """
    Return next document number for tenant + type, e.g. JE-000042.
    Uses SELECT FOR UPDATE on accounting.DocumentSequence.
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
