from django.conf import settings
from django.db import models
import datetime


class Tenant(models.Model):
    PLAN_CHOICES = (
        ('BASIC', 'Basic'),
        ('STANDARD', 'Standard'),
        ('PREMIUM', 'Premium'),
    )

    name = models.CharField(max_length=255)
    subdomain = models.CharField(max_length=100, unique=True)
    plan_type = models.CharField(max_length=20, choices=PLAN_CHOICES, default='BASIC')
    phone = models.CharField(max_length=30, blank=True, default='')
    address = models.TextField(blank=True, default='')
    sms_enabled = models.BooleanField(default=True)
    default_country_code = models.CharField(max_length=5, default='+92')
    gh_default_check_in_time = models.TimeField(default=datetime.time(18, 0))
    gh_default_check_out_time = models.TimeField(default=datetime.time(11, 0))
    tax_rate = models.DecimalField(
        max_digits=6,
        decimal_places=4,
        default=0.0500,
        help_text='Sales tax rate, e.g. 0.0500 for 5%.',
    )
    overtime_rate_per_hour = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=5000,
        help_text='Hall overtime charge per hour.',
    )
    default_currency = models.CharField(max_length=8, default='PKR')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Tenant'
        verbose_name_plural = 'Tenants'


class UserSettings(models.Model):
    """Per-user preferences: notifications, locale, theme."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='settings',
    )
    notify_new_bookings = models.BooleanField(default=True)
    notify_payments = models.BooleanField(default=True)
    notify_weekly_reports = models.BooleanField(default=True)
    notify_staff_activity = models.BooleanField(default=True)
    sms_to_customers = models.BooleanField(default=False)
    whatsapp_to_customers = models.BooleanField(default=False)
    timezone = models.CharField(max_length=64, default='Asia/Karachi')
    language = models.CharField(max_length=10, default='en')
    theme = models.CharField(max_length=10, default='light')

    def __str__(self):
        return f'Settings for {self.user}'


class NotificationLog(models.Model):
    TYPE_CHOICES = (
        ('SMS', 'SMS'),
        ('EMAIL', 'Email'),
        ('WHATSAPP', 'WhatsApp'),
    )
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('SENT', 'Sent'),
        ('FAILED', 'Failed'),
        ('SKIPPED', 'Skipped'),
    )

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='notifications', null=True, blank=True
    )
    booking = models.ForeignKey(
        'bookings.Booking', on_delete=models.CASCADE, null=True, blank=True, related_name='notifications'
    )
    customer = models.ForeignKey(
        'customers.Customer', on_delete=models.CASCADE, null=True, blank=True, related_name='notifications'
    )
    notification_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    recipient = models.CharField(max_length=255)
    message = models.TextField()
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Notification log'
        verbose_name_plural = 'SMS & notification log'

    def __str__(self):
        return f'{self.notification_type} → {self.recipient} ({self.status})'
