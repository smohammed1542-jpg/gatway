from django.conf import settings
from django.db import models

from core.models import Tenant


class Account(models.Model):
    TYPE_CHOICES = (
        ('ASSET', 'Asset'),
        ('LIABILITY', 'Liability'),
        ('EQUITY', 'Equity'),
        ('REVENUE', 'Revenue'),
        ('EXPENSE', 'Expense'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='accounts')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=120)
    account_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts'
        unique_together = [('tenant', 'code')]
        ordering = ['code']

    def __str__(self):
        return f'{self.code} {self.name}'


class Tax(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='taxes')
    name = models.CharField(max_length=80)
    rate = models.DecimalField(max_digits=6, decimal_places=4, help_text='e.g. 0.0500 for 5%')
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'taxes'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.rate})'


class FiscalPeriod(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='fiscal_periods')
    name = models.CharField(max_length=80)
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'fiscal_periods'
        ordering = ['-start_date']
        unique_together = [('tenant', 'name')]

    def __str__(self):
        return self.name


class JournalEntry(models.Model):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('POSTED', 'Posted'),
        ('CANCELLED', 'Cancelled'),
    )
    SOURCE_CHOICES = (
        ('booking', 'Sales invoice (booking)'),
        ('stay', 'Sales invoice (stay)'),
        ('payment', 'Incoming payment'),
        ('stay_payment', 'Stay payment'),
        ('expense', 'Expense'),
        ('gh_expense', 'Guest house expense'),
        ('reversal', 'Reversal'),
        ('manual', 'Manual'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='journal_entries')
    entry_no = models.CharField(max_length=40, blank=True, default='')
    entry_date = models.DateField()
    memo = models.CharField(max_length=255, blank=True, default='')
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual')
    source_id = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='POSTED')
    reversed_entry = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reversals',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='journal_entries_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'journal_entries'
        ordering = ['-entry_date', '-id']
        indexes = [
            models.Index(fields=['tenant', 'source_type', 'source_id']),
            models.Index(fields=['tenant', 'entry_date']),
        ]

    def __str__(self):
        return self.entry_no or f'JE-{self.pk}'


class JournalLine(models.Model):
    journal_entry = models.ForeignKey(
        JournalEntry, on_delete=models.CASCADE, related_name='lines'
    )
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='journal_lines')
    description = models.CharField(max_length=255, blank=True, default='')
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        db_table = 'journal_lines'
        ordering = ['id']

    def __str__(self):
        return f'{self.account.code} Dr {self.debit} Cr {self.credit}'


class AuditLog(models.Model):
    ACTION_CHOICES = (
        ('POST', 'Post'),
        ('REVERSE', 'Reverse'),
        ('VOID', 'Void'),
        ('CREATE', 'Create'),
        ('UPDATE', 'Update'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='audit_logs')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    entity_type = models.CharField(max_length=40)
    entity_id = models.PositiveIntegerField(null=True, blank=True)
    message = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['tenant', 'entity_type', 'entity_id']),
            models.Index(fields=['tenant', 'created_at']),
        ]

    def __str__(self):
        return f'{self.action} {self.entity_type} {self.entity_id}'

    @classmethod
    def record(cls, tenant, *, action, entity_type, entity_id=None, message='', actor=None):
        if not tenant:
            return None
        return cls.objects.create(
            tenant=tenant,
            actor=actor if getattr(actor, 'is_authenticated', False) else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            message=message or '',
        )
