from django.db import models
from core.models import Tenant
from customers.models import Customer
from venues.models import Venue
from django.conf import settings
from django.utils import timezone
import datetime
import random

class Booking(models.Model):
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('CONFIRMED', 'Confirmed'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    )
    
    PAYMENT_STATUS_CHOICES = (
        ('UNPAID', 'Unpaid'),
        ('PARTIAL', 'Partial'),
        ('PAID', 'Paid'),
    )

    SLOT_CHOICES = (
        ('morning', 'Morning'),
        ('evening', 'Evening'),
    )
    
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='bookings', null=True, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='bookings')
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='bookings')
    
    event_name = models.CharField(max_length=255)
    booking_id = models.CharField(max_length=50, blank=True, unique=True, null=True)
    booking_date = models.DateField(default=datetime.date.today)
    event_date = models.DateField(null=True, blank=True)
    slot = models.CharField(max_length=20, choices=SLOT_CHOICES, default='morning')
    
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    
    # Attendance details
    gents_count = models.PositiveIntegerField(default=0)
    ladies_count = models.PositiveIntegerField(default=0)
    guest_count = models.PositiveIntegerField(default=0)  # Total attendance

    # Rate and pricing details
    rate_per_head = models.DecimalField(max_digits=12, decimal_places=2, default=1200)
    
    # Special services charges
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    kitchen_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    decoration_package = models.ForeignKey(
        'decorations.DecorationPackage',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bookings',
    )
    decoration_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deg_count = models.PositiveIntegerField(default=0)
    generator_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Client Info per contract
    cnic = models.CharField(max_length=20, blank=True, null=True)
    
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    advance_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    remaining_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    booking_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='UNPAID')
    
    notes = models.TextField(blank=True, null=True)
    cancellation_reason = models.TextField(blank=True, default='')
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bookings_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['start_date']),
            models.Index(fields=['booking_status']),
        ]
        verbose_name = 'MH booking'
        verbose_name_plural = '3 · MH — Bookings'

    @staticmethod
    def _aware_datetime(value):
        if value is None:
            return None
        if settings.USE_TZ and timezone.is_naive(value):
            return timezone.make_aware(value, timezone.get_current_timezone())
        return value

    def save(self, *args, **kwargs):
        from .pricing import apply_booking_totals

        # Auto generate booking_id if not present
        if not self.booking_id:
            today_str = datetime.date.today().strftime('%Y')
            random_num = random.randint(1000, 9999)
            self.booking_id = f"BK-{today_str}-{random_num}"

        apply_booking_totals(self)

        # Also auto-calculate start_date and end_date if they are not provided but event_date and slot are provided
        if self.event_date:
            if self.slot == 'morning':
                # Morning: 12:00 PM to 4:00 PM
                start_dt = datetime.datetime.combine(self.event_date, datetime.time(12, 0))
                end_dt = datetime.datetime.combine(self.event_date, datetime.time(16, 0))
            else:
                # Evening: 7:00 PM to 11:00 PM
                start_dt = datetime.datetime.combine(self.event_date, datetime.time(19, 0))
                end_dt = datetime.datetime.combine(self.event_date, datetime.time(23, 0))
            
            # Make timezone aware if settings.USE_TZ is True
            if settings.USE_TZ:
                current_tz = timezone.get_current_timezone()
                self.start_date = timezone.make_aware(start_dt, current_tz)
                self.end_date = timezone.make_aware(end_dt, current_tz)
            else:
                self.start_date = start_dt
                self.end_date = end_dt
        else:
            # Fallback if event_date is not set
            if not self.start_date:
                self.start_date = timezone.now()
            if not self.end_date:
                self.end_date = self.start_date + datetime.timedelta(days=1)

        self.start_date = self._aware_datetime(self.start_date)
        self.end_date = self._aware_datetime(self.end_date)

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.event_name} - {self.customer.last_name}"


class MarriageHallPageVisibility(models.Model):
    """Per-tenant show/hide and maintenance toggles for Marriage Hall pages."""

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='hall_page_visibility',
    )
    page_key = models.CharField(max_length=32)
    label = models.CharField(max_length=64)
    is_visible = models.BooleanField(
        'Show in menu',
        default=True,
        help_text='Uncheck to hide this page from the sidebar and block direct access.',
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
        verbose_name = 'MH page visibility'
        verbose_name_plural = 'MH pages — show/hide & maintenance'

    def __str__(self):
        if self.in_maintenance:
            status = 'Maintenance'
        elif self.is_visible:
            status = 'Visible'
        else:
            status = 'Hidden'
        return f'{self.label} ({self.tenant.name}) - {status}'


class MarriageHallPageLive(MarriageHallPageVisibility):
    """Proxy for admin: show/hide pages in menu only."""

    class Meta:
        proxy = True
        verbose_name = 'MH page — show in menu'
        verbose_name_plural = '1 · MH pages — Show in menu (live)'


class MarriageHallPageMaintenance(MarriageHallPageVisibility):
    """Proxy for admin: maintenance mode toggle only."""

    class Meta:
        proxy = True
        verbose_name = 'MH page — maintenance'
        verbose_name_plural = '2 · MH pages — Maintenance & reopen time'
