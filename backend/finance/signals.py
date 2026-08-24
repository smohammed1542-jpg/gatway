from decimal import Decimal

from django.db.models import Sum
from django.db.models.signals import post_save
from django.dispatch import receiver

from accounting.services import AccountingService
from .models import Expense, Payment


def sync_booking_advance_paid(booking):
    total = booking.payments.filter(status='COMPLETED').aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')
    booking.advance_paid = total
    booking.save(update_fields=['advance_paid', 'remaining_balance', 'payment_status', 'total_price'])


@receiver(post_save, sender=Payment)
def payment_saved(sender, instance, **kwargs):
    if instance.booking_id:
        sync_booking_advance_paid(instance.booking)
    if instance.status == 'COMPLETED':
        AccountingService.post_payment(instance, user=getattr(instance, 'recorded_by', None))
    elif instance.status == 'VOIDED':
        AccountingService.reverse_source(
            instance.tenant, 'payment', instance.pk, user=getattr(instance, 'recorded_by', None)
        )


@receiver(post_save, sender=Expense)
def expense_saved(sender, instance, created, **kwargs):
    if instance.status == 'CANCELLED':
        AccountingService.reverse_source(
            instance.tenant, 'expense', instance.pk, user=getattr(instance, 'created_by', None)
        )
        return
    if not created:
        AccountingService.reverse_source(
            instance.tenant, 'expense', instance.pk, user=getattr(instance, 'created_by', None)
        )
    AccountingService.post_expense(instance, user=getattr(instance, 'created_by', None))
