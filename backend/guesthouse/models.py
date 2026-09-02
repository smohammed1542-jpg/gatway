from django.db import models
from django.conf import settings
from core.models import Tenant
from customers.models import Customer
import datetime
import random
from decimal import Decimal

from .billing import get_included_guests, compute_room_charges


class Room(models.Model):
    TYPE_CHOICES = (
        ('SINGLE', 'Single'),
        ('DOUBLE', 'Double'),
        ('SUITE', 'Suite'),
        ('FAMILY', 'Family'),
    )
    UNIT_KIND_CHOICES = (
        ('SUITE', 'Suite'),
        ('ROOM', 'Room'),
    )
    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('MAINTENANCE', 'Maintenance'),
        ('INACTIVE', 'Inactive'),
    )
    HOUSEKEEPING_CHOICES = (
        ('VACANT', 'Vacant'),
        ('OCCUPIED', 'Occupied'),
        ('CLEANING', 'Cleaning'),
        ('MAINTENANCE', 'Maintenance'),
        ('OUT_OF_ORDER', 'Out of order'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='gh_rooms')
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='children',
        help_text='Parent suite for this room. Suites must leave this empty.',
    )
    unit_kind = models.CharField(
        max_length=10,
        choices=UNIT_KIND_CHOICES,
        default='ROOM',
        help_text=(
            'Type of accommodation unit. Suite = top-level parent (parent must be empty). '
            'Room with no parent = independent. Room with parent = belongs to that suite.'
        ),
    )
    room_number = models.CharField(max_length=20)
    room_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='DOUBLE')
    beds = models.PositiveIntegerField(
        default=1,
        help_text='Legacy bed count. Prefer RoomBed rows when present.',
    )
    included_guests = models.PositiveIntegerField(
        default=0,
        help_text='Guests included in base rate. 0 = use bed count.',
    )
    max_guests = models.PositiveIntegerField(
        default=0,
        help_text='Hard cap including extra beds. 0 = included guests (or beds) only.',
    )
    extra_bed_allowed = models.BooleanField(default=False)
    extra_bed_limit = models.PositiveIntegerField(
        default=0,
        help_text='Max extra mattresses beyond included guests.',
    )
    extra_guest_fee_per_night = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Extra bedding / additional guest charge per night.',
    )
    price_per_night = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(blank=True, default='')
    image = models.ImageField(
        upload_to='gh_rooms/',
        blank=True,
        null=True,
        help_text='Deprecated. Use UnitMedia rows; kept for legacy data migration.',
    )
    amenities = models.ManyToManyField(
        'Amenity',
        through='UnitAmenity',
        blank=True,
        related_name='units',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    housekeeping_status = models.CharField(
        max_length=20,
        choices=HOUSEKEEPING_CHOICES,
        default='VACANT',
    )
    sellable = models.BooleanField(
        default=True,
        help_text='If false, unit is structural only and cannot be booked.',
    )
    addon_services = models.ManyToManyField(
        'GuestHouseService',
        blank=True,
        related_name='rooms',
        help_text='Extra services guests can add when booking this room.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('tenant', 'room_number')]
        ordering = ['room_number']
        verbose_name = 'GH room'
        verbose_name_plural = '3 · GH — Rooms'

    def __str__(self):
        kind = self.get_unit_kind_display() if self.unit_kind else self.get_room_type_display()
        return f'{self.room_number} ({kind})'

    @property
    def is_suite(self):
        return self.unit_kind == 'SUITE'

    @property
    def is_independent_room(self):
        return self.unit_kind == 'ROOM' and not self.parent_id

    def get_included_guests(self):
        return get_included_guests(self)

    def get_max_guests(self):
        included = get_included_guests(self)
        if self.max_guests and self.max_guests > 0:
            return int(self.max_guests)
        if self.extra_bed_allowed and self.extra_bed_limit:
            return included + int(self.extra_bed_limit)
        return included

    def get_bed_total(self):
        if self.pk and hasattr(self, 'bed_configs'):
            total = sum(b.quantity for b in self.bed_configs.all())
            if total:
                return total
        return int(self.beds or 1)

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.unit_kind == 'SUITE' and self.parent_id:
            raise ValidationError({'parent': 'A suite cannot belong to another suite.'})
        if self.parent_id and self.unit_kind == 'SUITE':
            raise ValidationError({'unit_kind': 'Child units must be rooms, not suites.'})
        if self.parent_id and self.parent_id == self.pk:
            raise ValidationError({'parent': 'A unit cannot be its own parent.'})
        if self.parent_id:
            parent = self.parent
            if parent and not parent.is_suite:
                raise ValidationError({'parent': 'Parent must be a suite.'})


class RoomBed(models.Model):
    BED_TYPE_CHOICES = (
        ('KING', 'King'),
        ('QUEEN', 'Queen'),
        ('TWIN', 'Twin'),
        ('SINGLE', 'Single'),
        ('SOFA', 'Sofa bed'),
        ('BUNK', 'Bunk'),
    )

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='bed_configs')
    bed_type = models.CharField(max_length=20, choices=BED_TYPE_CHOICES)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['id']
        verbose_name = 'GH room bed'
        verbose_name_plural = '3b · GH — Room beds'
        unique_together = [('room', 'bed_type')]

    def __str__(self):
        return f'{self.get_bed_type_display()} ×{self.quantity}'


class UnitMedia(models.Model):
    """Photos for a suite or room — not stored as a single column on Room."""

    UNIT_TYPE_CHOICES = (
        ('ROOM', 'Room'),
        ('SUITE', 'Suite'),
    )

    unit = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='media')
    unit_type = models.CharField(max_length=10, choices=UNIT_TYPE_CHOICES, default='ROOM')
    file = models.ImageField(upload_to='gh_unit_media/')
    caption = models.CharField(max_length=200, blank=True, default='')
    sort_order = models.PositiveIntegerField(default=0)
    is_cover = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = 'GH unit media'
        verbose_name_plural = '3c · GH — Unit media'

    def __str__(self):
        return f'{self.unit} media #{self.pk}'

    def save(self, *args, **kwargs):
        if self.unit_id:
            self.unit_type = 'SUITE' if self.unit.is_suite else 'ROOM'
        super().save(*args, **kwargs)
        if self.is_cover and self.unit_id:
            UnitMedia.objects.filter(unit_id=self.unit_id).exclude(pk=self.pk).update(is_cover=False)


class Amenity(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='gh_amenities')
    name = models.CharField(max_length=80)
    code = models.CharField(max_length=40, blank=True, default='')
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']
        unique_together = [('tenant', 'name')]
        verbose_name = 'GH amenity'
        verbose_name_plural = '3d · GH — Amenities'

    def __str__(self):
        return self.name


class UnitAmenity(models.Model):
    unit = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='unit_amenities')
    amenity = models.ForeignKey(Amenity, on_delete=models.CASCADE, related_name='unit_links')

    class Meta:
        unique_together = [('unit', 'amenity')]
        verbose_name = 'GH unit amenity'
        verbose_name_plural = '3e · GH — Unit amenities'

    def __str__(self):
        return f'{self.unit} · {self.amenity}'


class GuestHouseService(models.Model):
    PRICING_UNITS = (
        ('PER_NIGHT', 'Per night'),
        ('PER_STAY', 'Per stay'),
        ('PER_GUEST', 'Per guest per night'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='gh_services')
    code = models.CharField(max_length=32)
    label = models.CharField(max_length=120)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    pricing_unit = models.CharField(max_length=20, choices=PRICING_UNITS, default='PER_NIGHT')
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'label']
        unique_together = [('tenant', 'code')]
        verbose_name = 'GH add-on service'
        verbose_name_plural = '4 · GH — Add-on services'

    def __str__(self):
        return self.label


class StayBooking(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('CONFIRMED', 'Confirmed'),
        ('CHECKED_IN', 'Checked In'),
        ('CHECKED_OUT', 'Checked Out'),
        ('CANCELLED', 'Cancelled'),
    )
    PAYMENT_STATUS_CHOICES = (
        ('UNPAID', 'Unpaid'),
        ('PARTIAL', 'Partial'),
        ('PAID', 'Paid'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='gh_stays')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='gh_stays')
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name='stays')
    booking_ref = models.CharField(max_length=50, blank=True, unique=True, null=True)
    check_in = models.DateField()
    check_out = models.DateField()
    guests_count = models.PositiveIntegerField(default=1)
    adults_count = models.PositiveIntegerField(
        default=1,
        help_text='Guests aged 18 and above on this stay.',
    )
    children_count = models.PositiveIntegerField(
        default=0,
        help_text='Guests under 18 on this stay.',
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    advance_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='UNPAID')
    notes = models.TextField(blank=True, default='')
    cancellation_reason = models.TextField(blank=True, default='')
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gh_stays_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-check_in']
        verbose_name = 'GH stay'
        verbose_name_plural = '5 · GH — Stays & bookings'

    def __str__(self):
        return self.booking_ref or f'Stay #{self.pk}'

    @property
    def nights(self):
        if not self.check_in or not self.check_out:
            return 0
        return max((self.check_out - self.check_in).days, 1)

    @property
    def remaining_balance(self):
        if self.status == 'CANCELLED':
            return Decimal('0')
        return max(Decimal(str(self.total_amount)) - Decimal(str(self.advance_paid)), Decimal('0'))

    def recalculate_total(self):
        if not (self.room_id and self.check_in and self.check_out):
            return
        room = self.room
        nights = max((self.check_out - self.check_in).days, 1)
        room_charges = compute_room_charges(room, nights, self.guests_count)
        room_guest_total = room_charges['room_total']

        charges_total = Decimal('0')
        if self.pk:
            charges_total = self.charges.aggregate(t=models.Sum('amount'))['t'] or Decimal('0')

        self.total_amount = room_guest_total + charges_total

    def sync_payment_status(self):
        total = Decimal(str(self.total_amount))
        paid = Decimal(str(self.advance_paid))
        if paid <= 0:
            self.payment_status = 'UNPAID'
        elif paid >= total:
            self.payment_status = 'PAID'
        else:
            self.payment_status = 'PARTIAL'

    def save(self, *args, **kwargs):
        if not self.booking_ref:
            prefix = 'GH'
            date_part = datetime.date.today().strftime('%y%m%d')
            rand_part = str(random.randint(1000, 9999))
            self.booking_ref = f'{prefix}{date_part}{rand_part}'
        if self.room_id and self.check_in and self.check_out:
            self.recalculate_total()
        self.sync_payment_status()
        super().save(*args, **kwargs)


class StayCharge(models.Model):
    CHARGE_TYPES = (
        ('SERVICE', 'Add-on service'),
        ('CUSTOM', 'Custom charge'),
    )

    stay = models.ForeignKey(StayBooking, on_delete=models.CASCADE, related_name='charges')
    service = models.ForeignKey(
        GuestHouseService,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stay_charges',
    )
    charge_type = models.CharField(max_length=20, choices=CHARGE_TYPES, default='SERVICE')
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        verbose_name = 'GH stay charge'
        verbose_name_plural = '8 · GH — Stay charges (advanced)'

    def __str__(self):
        return f'{self.description} - {self.amount}'


class StayGuest(models.Model):
    """Guest on a stay — primary booker plus companions (Booking.com-style roster)."""
    stay = models.ForeignKey(StayBooking, on_delete=models.CASCADE, related_name='guest_roster')
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stay_guest_entries',
    )
    full_name = models.CharField(max_length=200)
    cnic = models.CharField(max_length=20, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    is_minor = models.BooleanField(default=False)
    address = models.TextField(blank=True, default='')
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'id']

    def __str__(self):
        role = 'Primary' if self.is_primary else 'Guest'
        return f'{self.full_name} ({role})'


class StayPayment(models.Model):
    METHOD_CHOICES = (
        ('CASH', 'Cash'),
        ('CARD', 'Credit/Debit Card'),
        ('BANK_TRANSFER', 'Bank Transfer'),
        ('ONLINE', 'Online Payment'),
    )
    STATUS_CHOICES = (
        ('COMPLETED', 'Completed'),
        ('PENDING', 'Pending'),
        ('FAILED', 'Failed'),
        ('VOIDED', 'Voided'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='gh_payments')
    stay = models.ForeignKey(StayBooking, on_delete=models.PROTECT, related_name='payments')
    receipt_ref = models.CharField(max_length=50, blank=True, unique=True, null=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='CASH')
    transaction_id = models.CharField(max_length=100, blank=True, default='')
    payment_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='COMPLETED')
    notes = models.TextField(blank=True, default='')
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gh_payments_recorded',
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-payment_date']
        verbose_name = 'GH payment'
        verbose_name_plural = '6 · GH — Payments'

    def __str__(self):
        return self.receipt_ref or f'GH-PAY-{self.id}'

    def save(self, *args, **kwargs):
        if not self.receipt_ref:
            prefix = 'GHR'
            date_part = datetime.date.today().strftime('%y%m%d')
            for _ in range(12):
                candidate = f'{prefix}{date_part}{random.randint(1000, 9999)}'
                if not StayPayment.objects.filter(receipt_ref=candidate).exists():
                    self.receipt_ref = candidate
                    break
            if not self.receipt_ref:
                self.receipt_ref = f'{prefix}{date_part}{random.randint(10000, 99999)}'
        super().save(*args, **kwargs)


class GhExpense(models.Model):
    CATEGORY_CHOICES = (
        ('SALARY', 'Salary'),
        ('UTILITIES', 'Utilities'),
        ('MAINTENANCE', 'Maintenance'),
        ('SUPPLIES', 'Supplies'),
        ('LAUNDRY', 'Laundry'),
        ('MARKETING', 'Marketing'),
        ('OTHER', 'Other'),
    )
    STATUS_CHOICES = (
        ('POSTED', 'Posted'),
        ('CANCELLED', 'Cancelled'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='gh_expenses')
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='OTHER')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    description = models.TextField(blank=True, default='')
    account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gh_expenses',
    )
    vendor = models.ForeignKey(
        'accounting.Vendor',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gh_expenses',
    )
    paid_through = models.CharField(
        max_length=10,
        choices=(
            ('CASH', 'Cash'),
            ('BANK', 'Bank'),
            ('AP', 'Accounts Payable'),
        ),
        default='CASH',
    )
    bank_account = models.ForeignKey(
        'accounting.BankAccount',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gh_expenses',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='POSTED')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gh_expenses_created',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gh_expenses_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gh_expenses'
        ordering = ['-expense_date', '-id']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'expense_date']),
        ]
        verbose_name = 'GH expense'
        verbose_name_plural = '7 · GH — Expenses'

    def __str__(self):
        return self.title


class GuestHousePageVisibility(models.Model):
    """Per-tenant show/hide and maintenance toggles for Guest House pages."""

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='gh_page_visibility',
    )
    page_key = models.CharField(max_length=32)
    label = models.CharField(max_length=64)
    is_visible = models.BooleanField(
        'Show in menu',
        default=True,
        help_text='Uncheck to hide this page or module from the sidebar and block direct access.',
    )
    in_maintenance = models.BooleanField(
        'Maintenance mode',
        default=False,
        help_text='When enabled, users who open this page see an “Under maintenance” screen.',
    )
    maintenance_until = models.DateTimeField(
        'Maintenance ends at',
        null=True,
        blank=True,
        help_text='Optional. Page reopens automatically after this date & time (Asia/Karachi).',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'page_key']
        unique_together = [('tenant', 'page_key')]
        verbose_name = 'GH page visibility'
        verbose_name_plural = 'GH pages — show/hide & maintenance'

    def __str__(self):
        if self.in_maintenance:
            status = 'Maintenance'
        elif self.is_visible:
            status = 'Visible'
        else:
            status = 'Hidden'
        return f'{self.label} ({self.tenant.name}) - {status}'


class GuestHousePageLive(GuestHousePageVisibility):
    """Proxy for admin: show/hide pages in menu only."""

    class Meta:
        proxy = True
        verbose_name = 'GH page — show in menu'
        verbose_name_plural = '1 · GH pages — Show in menu (live)'


class GuestHousePageMaintenance(GuestHousePageVisibility):
    """Proxy for admin: maintenance mode toggle only."""

    class Meta:
        proxy = True
        verbose_name = 'GH page — maintenance'
        verbose_name_plural = '2 · GH pages — Maintenance & reopen time'
