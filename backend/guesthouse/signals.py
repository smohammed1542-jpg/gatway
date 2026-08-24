from decimal import Decimal

from django.db.models import Sum
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from accounting.services import AccountingService
from core.models import Tenant, UserSettings
from core.notifications.service import dispatch_customer_notification
from .models import StayPayment, StayBooking, GhExpense
from .page_visibility import ensure_tenant_gh_pages


def _channels_for_user(user):
    if not user or not user.is_authenticated:
        return []
    settings, _ = UserSettings.objects.get_or_create(user=user)
    channels = []
    if settings.sms_to_customers:
        channels.append('SMS')
    if settings.whatsapp_to_customers:
        channels.append('WHATSAPP')
    return channels


def sync_stay_advance_paid(stay):
    total = stay.payments.filter(status='COMPLETED').aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')
    stay.advance_paid = max(Decimal('0'), total)
    stay.sync_payment_status()
    stay.save(update_fields=['advance_paid', 'payment_status'])


@receiver(post_save, sender=StayBooking)
def gh_stay_booking_notification(sender, instance, created, **kwargs):
    if not created or instance.status == 'CANCELLED':
        return
    user = instance.created_by
    channels = _channels_for_user(user)
    if not channels or not instance.customer_id or not instance.tenant_id:
        return
    room_no = instance.room.room_number if instance.room_id else '-'
    msg = (
        f'Stay booked: Room {room_no}, {instance.check_in} to {instance.check_out}. '
        f'Ref: {instance.booking_ref or instance.id}. Gateway Guest House'
    )
    dispatch_customer_notification(
        tenant=instance.tenant,
        booking=None,
        customer=instance.customer,
        channels=channels,
        message=msg,
        triggered_by=user,
    )


@receiver(post_save, sender=StayBooking)
def post_stay_ledger(sender, instance, **kwargs):
    update_fields = kwargs.get('update_fields')
    if update_fields and set(update_fields) <= {
        'advance_paid', 'payment_status', 'total_amount', 'updated_at',
    }:
        return
    AccountingService.sync_stay(instance, user=getattr(instance, 'created_by', None))


@receiver(post_save, sender=StayPayment)
def stay_payment_saved(sender, instance, **kwargs):
    if instance.stay_id:
        sync_stay_advance_paid(instance.stay)
    if instance.status == 'COMPLETED':
        AccountingService.post_stay_payment(instance, user=getattr(instance, 'recorded_by', None))
    elif instance.status == 'VOIDED':
        AccountingService.reverse_source(
            instance.tenant, 'stay_payment', instance.pk, user=getattr(instance, 'recorded_by', None)
        )


@receiver(post_save, sender=StayPayment)
def gh_stay_payment_notification(sender, instance, created, **kwargs):
    if not created or instance.status != 'COMPLETED':
        return
    stay = instance.stay
    if not stay or not stay.customer_id or not stay.tenant_id:
        return
    user = instance.recorded_by
    channels = _channels_for_user(user)
    if not channels:
        return
    remaining = float(stay.remaining_balance or 0)
    msg = (
        f'Payment received: Rs {float(instance.amount):,.0f} for stay '
        f'{stay.booking_ref or stay.id}. Remaining balance: Rs {remaining:,.0f}. '
        f'Gateway Guest House'
    )
    dispatch_customer_notification(
        tenant=stay.tenant,
        booking=None,
        customer=stay.customer,
        channels=channels,
        message=msg,
        triggered_by=user,
    )


@receiver(post_delete, sender=StayPayment)
def stay_payment_deleted(sender, instance, **kwargs):
    if instance.stay_id:
        try:
            stay = StayBooking.objects.get(pk=instance.stay_id)
            sync_stay_advance_paid(stay)
        except StayBooking.DoesNotExist:
            pass


@receiver(post_save, sender=Tenant)
def seed_tenant_gh_pages(sender, instance, created, **kwargs):
    ensure_tenant_gh_pages(instance)


@receiver(post_save, sender=GhExpense)
def gh_expense_saved(sender, instance, created, **kwargs):
    if instance.status == 'CANCELLED':
        AccountingService.reverse_source(
            instance.tenant, 'gh_expense', instance.pk, user=getattr(instance, 'created_by', None)
        )
        return
    if not created:
        AccountingService.reverse_source(
            instance.tenant, 'gh_expense', instance.pk, user=getattr(instance, 'created_by', None)
        )
    AccountingService.post_expense(
        instance, user=getattr(instance, 'created_by', None), source_type='gh_expense'
    )
