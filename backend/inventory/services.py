from django.db import transaction

from .models import InventoryTransaction


class InventoryService:
    @staticmethod
    def _sync_status(item):
        qty = int(item.quantity or 0)
        if qty <= 0:
            item.status = 'OUT_OF_STOCK'
        elif qty <= 5:
            item.status = 'LOW_STOCK'
        else:
            item.status = 'IN_STOCK'

    @staticmethod
    @transaction.atomic
    def move(item, quantity, *, txn_type, booking=None, notes='', user=None, tenant=None):
        qty = int(quantity)
        if qty == 0:
            return None
        signed = qty if txn_type in ('IN', 'OPENING', 'ADJUST') else -abs(qty)
        if txn_type == 'ADJUST':
            signed = qty
        item.quantity = int(item.quantity or 0) + signed
        InventoryService._sync_status(item)
        item.save(update_fields=['quantity', 'status'] if hasattr(item, 'status') else ['quantity'])
        txn = InventoryTransaction.objects.create(
            tenant=tenant or item.tenant,
            item=item,
            quantity=signed,
            txn_type=txn_type,
            booking=booking,
            notes=notes or '',
            created_by=user if getattr(user, 'is_authenticated', False) else None,
        )
        from accounting.services import AccountingService
        AccountingService.post_inventory_movement(txn, user=user)
        return txn

    @staticmethod
    def apply_booking_allocation(allocation, previous_qty=0, user=None):
        delta = int(allocation.quantity_used or 0) - int(previous_qty or 0)
        if delta == 0:
            return
        txn_type = 'OUT' if delta > 0 else 'IN'
        InventoryService.move(
            allocation.inventory_item,
            abs(delta),
            txn_type=txn_type,
            booking=allocation.booking,
            notes=f'Booking allocation {allocation.booking_id}',
            user=user,
            tenant=allocation.tenant,
        )

    @staticmethod
    def reverse_booking_allocation(allocation, user=None):
        qty = int(allocation.quantity_used or 0)
        if qty <= 0:
            return
        InventoryService.move(
            allocation.inventory_item,
            qty,
            txn_type='IN',
            booking=allocation.booking,
            notes=f'Reverse allocation {allocation.booking_id}',
            user=user,
            tenant=allocation.tenant,
        )
