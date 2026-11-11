import logging

from django.db import models, transaction


logger = logging.getLogger(__name__)


def _delete_media(files):
    for storage, name in files:
        try:
            storage.delete(name)
        except Exception:
            logger.exception('Could not delete tenant media file %s', name)


@transaction.atomic
def reset_tenant_business_data(tenant):
    from accounting.models import (
        AuditLog,
        BankReconciliation,
        BankTransfer,
        Invoice,
        JournalEntry,
        Vendor,
        VendorBill,
        VendorPayment,
    )
    from authentication.models import StaffProfile
    from bookings.models import Booking, BookingService, HallService
    from core.models import NotificationLog
    from customers.models import Customer
    from decorations.models import DecorationPackage
    from finance.models import Expense, Payment
    from guesthouse.models import Amenity, GhExpense, GuestHouseService, Room, StayBooking, StayPayment, UnitMedia
    from inventory.models import BookingInventoryItem, InventoryItem, InventoryTransaction
    from venues.models import Venue

    media_files = []
    seen_media = set()
    media_querysets = (
        Venue.objects.filter(tenant=tenant),
        Room.objects.filter(tenant=tenant),
        UnitMedia.objects.filter(unit__tenant=tenant),
    )
    for queryset in media_querysets:
        for obj in queryset.iterator():
            for field in obj._meta.concrete_fields:
                if not isinstance(field, models.FileField):
                    continue
                file = getattr(obj, field.name, None)
                if not file or not file.name:
                    continue
                key = (file.storage.__class__, file.name)
                if key not in seen_media:
                    seen_media.add(key)
                    media_files.append((file.storage, file.name))

    deletion_order = (
        NotificationLog,
        Payment,
        StayPayment,
        Invoice,
        VendorPayment,
        VendorBill,
        BankTransfer,
        BankReconciliation,
        JournalEntry,
        GhExpense,
        Expense,
        InventoryTransaction,
        BookingInventoryItem,
        BookingService,
        StayBooking,
        Booking,
        Customer,
        Vendor,
        StaffProfile,
        Venue,
        DecorationPackage,
        HallService,
        GuestHouseService,
        Amenity,
        Room,
        InventoryItem,
        AuditLog,
    )

    deleted_records = 0
    for model in deletion_order:
        if model is Room:
            Room.objects.filter(tenant=tenant).update(parent=None)
        deleted, _ = model.objects.filter(tenant=tenant).delete()
        deleted_records += deleted

    if media_files:
        transaction.on_commit(lambda: _delete_media(media_files), robust=True)

    return deleted_records