from django.conf import settings
from django.core.exceptions import ValidationError
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
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
    )
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts'
        unique_together = [('tenant', 'code')]
        ordering = ['code']

    def __str__(self):
        return f'{self.code} {self.name}'

    def has_transactions(self):
        return self.journal_lines.exists()


class Tax(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='taxes')
    name = models.CharField(max_length=80)
    rate = models.DecimalField(max_digits=6, decimal_places=4, help_text='e.g. 0.0500 for 5%')
    tax_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='taxes',
    )
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


class Vendor(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='vendors')
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=40, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    address = models.TextField(blank=True, default='')
    tax_info = models.CharField(max_length=120, blank=True, default='')
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vendors'
        ordering = ['name']
        unique_together = [('tenant', 'name')]

    def __str__(self):
        return self.name


class BankAccount(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='bank_accounts')
    bank_name = models.CharField(max_length=120)
    account_name = models.CharField(max_length=120)
    account_number = models.CharField(max_length=60, blank=True, default='')
    gl_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='bank_accounts',
    )
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bank_accounts'
        ordering = ['bank_name', 'account_name']

    def __str__(self):
        return f'{self.bank_name} — {self.account_name}'

    @property
    def masked_account_number(self):
        num = (self.account_number or '').strip()
        if len(num) <= 4:
            return num or '****'
        return f'****{num[-4:]}'


class JournalEntry(models.Model):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('POSTED', 'Posted'),
        ('CANCELLED', 'Cancelled'),
        ('REVERSED', 'Reversed'),
    )
    SOURCE_CHOICES = (
        ('booking', 'Sales invoice (booking)'),
        ('stay', 'Sales invoice (stay)'),
        ('payment', 'Incoming payment'),
        ('stay_payment', 'Stay payment'),
        ('expense', 'Expense'),
        ('gh_expense', 'Guest house expense'),
        ('vendor_bill', 'Vendor bill'),
        ('vendor_payment', 'Vendor payment'),
        ('transfer', 'Bank/cash transfer'),
        ('opening', 'Opening balance'),
        ('invoice', 'Customer invoice'),
        ('reversal', 'Reversal'),
        ('manual', 'Manual'),
        ('adjustment', 'Adjustment'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='journal_entries')
    entry_no = models.CharField(max_length=40, blank=True, default='')
    entry_date = models.DateField()
    memo = models.CharField(max_length=255, blank=True, default='')
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual')
    source_id = models.PositiveIntegerField(null=True, blank=True)
    # Set for active source-linked POSTED journals; cleared on reverse so a correction can repost.
    active_source_key = models.CharField(max_length=80, null=True, blank=True, db_index=True)
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
            models.Index(fields=['tenant', 'status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'active_source_key'],
                condition=models.Q(active_source_key__isnull=False),
                name='uniq_journal_active_source_key',
            ),
        ]

    def __str__(self):
        return self.entry_no or f'JE-{self.pk}'

    @staticmethod
    def make_active_source_key(source_type, source_id):
        """Unique key for one active source-linked journal. Manual/reversal have no key."""
        if source_type in ('manual', 'reversal') or source_id is None:
            return None
        return f'{source_type}:{source_id}'


class JournalLine(models.Model):
    journal_entry = models.ForeignKey(
        JournalEntry, on_delete=models.CASCADE, related_name='lines'
    )
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='journal_lines')
    description = models.CharField(max_length=255, blank=True, default='')
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='journal_lines',
    )
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='journal_lines',
    )
    booking = models.ForeignKey(
        'bookings.Booking',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='journal_lines',
    )
    stay = models.ForeignKey(
        'guesthouse.StayBooking',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='journal_lines',
    )
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='journal_lines',
    )
    reconciled = models.BooleanField(default=False)
    reconciliation = models.ForeignKey(
        'BankReconciliation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='matched_lines',
    )

    class Meta:
        db_table = 'journal_lines'
        ordering = ['id']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(debit__gte=0) & models.Q(credit__gte=0),
                name='journal_line_non_negative',
            ),
        ]

    def __str__(self):
        return f'{self.account.code} Dr {self.debit} Cr {self.credit}'

    def clean(self):
        if self.debit and self.credit and self.debit > 0 and self.credit > 0:
            raise ValidationError('A journal line cannot have both debit and credit.')


class VendorBill(models.Model):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('POSTED', 'Posted'),
        ('PARTIAL', 'Partially Paid'),
        ('PAID', 'Paid'),
        ('CANCELLED', 'Cancelled'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='vendor_bills')
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name='bills')
    bill_no = models.CharField(max_length=40, blank=True, default='')
    bill_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    expense_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='vendor_bills',
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    description = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='POSTED')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendor_bills_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vendor_bills'
        ordering = ['-bill_date', '-id']
        unique_together = [('tenant', 'bill_no')]

    @property
    def balance_due(self):
        return self.amount - self.amount_paid

    def __str__(self):
        return self.bill_no or f'VB-{self.pk}'


class VendorPayment(models.Model):
    METHOD_CHOICES = (
        ('CASH', 'Cash'),
        ('CARD', 'Card'),
        ('BANK_TRANSFER', 'Bank Transfer'),
        ('ONLINE', 'Online'),
        ('OTHER', 'Other'),
    )
    STATUS_CHOICES = (
        ('COMPLETED', 'Completed'),
        ('VOIDED', 'Voided'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='vendor_payments')
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name='payments')
    bill = models.ForeignKey(
        VendorBill,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments',
    )
    payment_no = models.CharField(max_length=40, blank=True, default='')
    payment_date = models.DateField()
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='CASH')
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendor_payments',
    )
    notes = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='COMPLETED')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendor_payments_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vendor_payments'
        ordering = ['-payment_date', '-id']

    def __str__(self):
        return self.payment_no or f'VP-{self.pk}'


class BankTransfer(models.Model):
    STATUS_CHOICES = (
        ('POSTED', 'Posted'),
        ('VOIDED', 'Voided'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='bank_transfers')
    transfer_date = models.DateField()
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    from_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='transfers_out',
    )
    to_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='transfers_in',
    )
    from_bank = models.ForeignKey(
        BankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers_out',
    )
    to_bank = models.ForeignKey(
        BankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers_in',
    )
    memo = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='POSTED')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_transfers_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bank_transfers'
        ordering = ['-transfer_date', '-id']

    def __str__(self):
        return f'TRF-{self.pk}'


class BankReconciliation(models.Model):
    STATUS_CHOICES = (
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='bank_reconciliations')
    bank_account = models.ForeignKey(BankAccount, on_delete=models.PROTECT, related_name='reconciliations')
    statement_date = models.DateField()
    statement_balance = models.DecimalField(max_digits=14, decimal_places=2)
    book_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    difference = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='IN_PROGRESS')
    notes = models.TextField(blank=True, default='')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reconciliations_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bank_reconciliations'
        ordering = ['-statement_date', '-id']

    def __str__(self):
        return f'Recon {self.bank_account_id} {self.statement_date}'


class Invoice(models.Model):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('ISSUED', 'Issued'),
        ('PARTIAL', 'Partially Paid'),
        ('PAID', 'Paid'),
        ('OVERDUE', 'Overdue'),
        ('CANCELLED', 'Cancelled'),
    )

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='invoices')
    invoice_no = models.CharField(max_length=40, blank=True, default='')
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.PROTECT,
        related_name='invoices',
    )
    booking = models.ForeignKey(
        'bookings.Booking',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
    )
    stay = models.ForeignKey(
        'guesthouse.StayBooking',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
    )
    invoice_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ISSUED')
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'invoices'
        ordering = ['-invoice_date', '-id']
        unique_together = [('tenant', 'invoice_no')]

    @property
    def balance_due(self):
        return self.total - self.amount_paid

    def __str__(self):
        return self.invoice_no or f'INV-{self.pk}'


class AuditLog(models.Model):
    ACTION_CHOICES = (
        ('POST', 'Post'),
        ('REVERSE', 'Reverse'),
        ('VOID', 'Void'),
        ('CREATE', 'Create'),
        ('UPDATE', 'Update'),
        ('CLOSE', 'Close period'),
        ('REOPEN', 'Reopen period'),
        ('DEACTIVATE', 'Deactivate'),
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
    reason = models.CharField(max_length=255, blank=True, default='')
    previous_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
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
    def record(
        cls,
        tenant,
        *,
        action,
        entity_type,
        entity_id=None,
        message='',
        actor=None,
        reason='',
        previous_value=None,
        new_value=None,
    ):
        if not tenant:
            return None
        return cls.objects.create(
            tenant=tenant,
            actor=actor if getattr(actor, 'is_authenticated', False) else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            message=message or '',
            reason=reason or '',
            previous_value=previous_value,
            new_value=new_value,
        )
