from django.db.models.signals import post_save
from django.dispatch import receiver

from accounting.services import AccountingService
from core.models import Tenant
from .models import Booking
from .page_visibility import ensure_tenant_hall_pages


@receiver(post_save, sender=Tenant)
def seed_tenant_hall_pages(sender, instance, **kwargs):
    ensure_tenant_hall_pages(instance)


@receiver(post_save, sender=Booking)
def post_booking_ledger(sender, instance, **kwargs):
    update_fields = kwargs.get('update_fields')
    if update_fields and set(update_fields) <= {
        'advance_paid', 'remaining_balance', 'payment_status', 'total_price', 'updated_at',
    }:
        return
    # Let ValueError bubble (serializer converts to 400). Other unexpected
    # accounting failures should not become opaque HTML 500s without context —
    # re-raise as ValueError so the API can return a readable message.
    try:
        AccountingService.sync_booking(instance, user=getattr(instance, 'created_by', None))
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            f'Accounting post failed while saving booking: {exc}'
        ) from exc
