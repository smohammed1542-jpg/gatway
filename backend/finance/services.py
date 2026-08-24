from decimal import Decimal

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from accounting.services import AccountingService
from .models import Payment, Expense


class PaymentService:
    @staticmethod
    @transaction.atomic
    def record_refund(booking, amount, notes='', user=None, payment_method='CASH'):
        payment = Payment.objects.create(
            booking=booking,
            amount=-abs(Decimal(str(amount))),
            payment_method=payment_method,
            status='COMPLETED',
            notes=notes or 'Refund',
            tenant=booking.tenant,
            recorded_by=user if getattr(user, 'is_authenticated', False) else None,
        )
        return payment

    @staticmethod
    @transaction.atomic
    def void(payment, user=None):
        if payment.status == 'VOIDED':
            return payment
        payment.status = 'VOIDED'
        payment.save(update_fields=['status', 'updated_at'] if hasattr(payment, 'updated_at') else ['status'])
        AccountingService.reverse_source(
            payment.tenant, 'payment', payment.pk, user=user
        )
        return payment


class ExpenseService:
    @staticmethod
    @transaction.atomic
    def void(expense, user=None):
        if getattr(expense, 'status', None) == 'CANCELLED':
            return expense
        expense.status = 'CANCELLED'
        update = ['status']
        if hasattr(expense, 'updated_at'):
            update.append('updated_at')
        if hasattr(expense, 'updated_by'):
            expense.updated_by = user if getattr(user, 'is_authenticated', False) else None
            update.append('updated_by')
        expense.save(update_fields=update)
        AccountingService.reverse_source(
            expense.tenant, 'expense', expense.pk, user=user
        )
        return expense


class SoftVoidMixin:
    """Replace DELETE with a void/cancel that preserves financial history."""

    void_status = 'VOIDED'
    source_type = 'payment'

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        current = getattr(instance, 'status', None)
        if current in (self.void_status, 'CANCELLED'):
            return Response(self.get_serializer(instance).data)
        instance.status = self.void_status
        fields = ['status']
        if hasattr(instance, 'updated_at'):
            fields.append('updated_at')
        instance.save(update_fields=fields)
        AccountingService.reverse_source(
            instance.tenant, self.source_type, instance.pk, user=request.user
        )
        try:
            from accounting.models import AuditLog
            AuditLog.record(
                instance.tenant,
                action='VOID',
                entity_type=self.source_type,
                entity_id=instance.pk,
                message=f'{self.source_type} {instance.pk} {self.void_status}',
                actor=request.user,
            )
        except Exception:
            pass
        return Response(self.get_serializer(instance).data, status=status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if getattr(instance, 'status', None) in ('VOIDED', 'CANCELLED', 'COMPLETED'):
            if not kwargs.get('partial') or set(request.data.keys()) - {'notes'}:
                return Response(
                    {'detail': 'Posted financial records cannot be modified. Void and recapture if needed.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return super().update(request, *args, **kwargs)
