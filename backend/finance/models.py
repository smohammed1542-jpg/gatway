from django.db import models
from django.conf import settings

from core.models import Tenant
from bookings.models import Booking


class Payment(models.Model):
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

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='payments', null=True, blank=True)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='CASH')
    transaction_id = models.CharField(max_length=100, blank=True, null=True)
    receipt_no = models.CharField(max_length=40, blank=True, default='')
    bank_account = models.ForeignKey(
        'accounting.BankAccount',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customer_payments',
    )
    payment_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='COMPLETED')
    notes = models.TextField(blank=True, null=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_payments',
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'receipt_no'],
                condition=~models.Q(receipt_no='') & models.Q(receipt_no__isnull=False) & models.Q(tenant__isnull=False),
                name='uniq_payment_tenant_receipt_no',
            ),
        ]

    def __str__(self):
        return f"PAY-{self.id} for {self.booking.event_name}"

    def save(self, *args, **kwargs):
        creating = self.pk is None
        super().save(*args, **kwargs)
        if not self.receipt_no and self.pk:
            candidate = f'RCP-{self.pk:06d}'
            # Tenant-scoped uniqueness: prefix with tenant when needed for collisions across resets
            Payment.objects.filter(pk=self.pk).update(receipt_no=candidate)
            self.receipt_no = candidate
        elif creating and self.receipt_no:
            # Ensure saved with provided receipt_no
            pass


class Expense(models.Model):
    CATEGORY_CHOICES = (
        ('SALARY', 'Salary'),
        ('UTILITIES', 'Utilities'),
        ('DECORATION', 'Decoration'),
        ('MAINTENANCE', 'Maintenance'),
        ('CATERING', 'Catering'),
        ('OTHER', 'Other'),
    )

    STATUS_CHOICES = (
        ('POSTED', 'Posted'),
        ('CANCELLED', 'Cancelled'),
    )

    PAID_THROUGH_CHOICES = (
        ('CASH', 'Cash'),
        ('BANK', 'Bank'),
        ('AP', 'Accounts Payable'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='expenses', null=True, blank=True)
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='OTHER')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    description = models.TextField(blank=True, null=True)
    account = models.ForeignKey(
        'accounting.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses',
    )
    vendor = models.ForeignKey(
        'accounting.Vendor',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses',
    )
    paid_through = models.CharField(max_length=10, choices=PAID_THROUGH_CHOICES, default='CASH')
    bank_account = models.ForeignKey(
        'accounting.BankAccount',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='POSTED')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses_updated',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
