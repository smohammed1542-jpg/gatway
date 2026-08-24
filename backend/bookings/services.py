from django.db import transaction

from .pricing import apply_booking_totals


class SalesService:
    """Hall booking domain operations."""

    POSTED_STATUSES = ('COMPLETED', 'CANCELLED')

    @staticmethod
    def is_posted(booking):
        return getattr(booking, 'booking_status', None) in SalesService.POSTED_STATUSES

    @staticmethod
    def apply_pricing(booking):
        return apply_booking_totals(booking)

    @staticmethod
    @transaction.atomic
    def cancel(booking, *, reason='', refund_advance=False, user=None):
        from decimal import Decimal
        from django.utils import timezone
        from finance.services import PaymentService

        if booking.booking_status == 'CANCELLED':
            raise ValueError('Booking is already cancelled.')
        if booking.booking_status == 'COMPLETED':
            raise ValueError('Completed booking cannot be cancelled.')

        booking.booking_status = 'CANCELLED'
        booking.cancellation_reason = reason or ''
        booking.cancelled_at = timezone.now()
        booking.remaining_balance = Decimal('0')
        booking.save()

        if refund_advance:
            paid = booking.advance_paid or Decimal('0')
            if paid > 0:
                PaymentService.record_refund(
                    booking,
                    amount=paid,
                    notes='Refund on booking cancellation',
                    user=user,
                )
        return booking
