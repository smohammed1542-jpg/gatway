from django.db import models
from django.conf import settings
from core.models import Tenant

class Customer(models.Model):
    LIST_STATUS_CHOICES = (
        ('NORMAL', 'Normal'),
        ('WHITELISTED', 'Whitelisted'),
        ('BLOCKLISTED', 'Blocklisted'),
    )
    GENDER_CHOICES = (
        ('', '—'),
        ('MALE', 'Male'),
        ('FEMALE', 'Female'),
    )
    RELATIVE_RELATION_CHOICES = (
        ('', '—'),
        ('FATHER', 'Father'),
        ('HUSBAND', 'Husband'),
        ('SON', 'Son'),
        ('OTHER', 'Other'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='customers', null=True, blank=True)
    full_name = models.CharField(max_length=200, blank=True, default='')
    cnic = models.CharField(max_length=20, blank=True, default='')
    first_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100, blank=True, default='')
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True, default='')
    relative_relation = models.CharField(
        max_length=16,
        choices=RELATIVE_RELATION_CHOICES,
        blank=True,
        default='',
    )
    relative_name = models.CharField(max_length=200, blank=True, default='')
    address = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    is_minor = models.BooleanField(default=False)
    linked_primary = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='linked_companions',
    )
    list_status = models.CharField(max_length=16, choices=LIST_STATUS_CHOICES, default='NORMAL')
    list_status_note = models.CharField(max_length=255, blank=True, default='')
    list_status_updated_at = models.DateTimeField(null=True, blank=True)
    list_status_updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customer_list_status_updates',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customers_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'customers'
        indexes = [
            models.Index(fields=['tenant', 'phone']),
            models.Index(fields=['tenant', 'email']),
            models.Index(fields=['email']),
            models.Index(fields=['phone']),
        ]

    @property
    def display_name(self):
        if self.full_name and self.full_name.strip():
            return self.full_name.strip()
        return f"{self.first_name} {self.last_name}".strip() or 'Client'

    def __str__(self):
        return self.display_name
