from django.contrib import admin

from core.admin_mixins import TenantScopedAdminMixin
from .models import (
    Account, AuditLog, BankAccount, BankReconciliation, BankTransfer,
    FiscalPeriod, Invoice, JournalEntry, JournalLine, Tax,
    Vendor, VendorBill, VendorPayment,
)


class JournalLineInline(admin.TabularInline):
    model = JournalLine
    extra = 0
    readonly_fields = (
        'account', 'description', 'debit', 'credit',
        'customer', 'vendor', 'booking', 'stay',
    )


@admin.register(Account)
class AccountAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('code', 'name', 'account_type', 'is_system', 'is_active', 'tenant')
    list_filter = ('account_type', 'is_active', 'is_system')
    search_fields = ('code', 'name')


@admin.register(Tax)
class TaxAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('name', 'rate', 'is_default', 'is_active', 'tenant')


@admin.register(FiscalPeriod)
class FiscalPeriodAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('name', 'start_date', 'end_date', 'is_closed', 'tenant')


@admin.register(JournalEntry)
class JournalEntryAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('entry_no', 'entry_date', 'source_type', 'status', 'memo', 'tenant')
    list_filter = ('status', 'source_type')
    search_fields = ('entry_no', 'memo')
    readonly_fields = (
        'entry_no', 'entry_date', 'memo', 'source_type', 'source_id',
        'status', 'reversed_entry', 'created_by', 'created_at', 'updated_at', 'tenant',
    )
    inlines = [JournalLineInline]


@admin.register(AuditLog)
class AuditLogAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('created_at', 'action', 'entity_type', 'entity_id', 'message', 'tenant')
    list_filter = ('action', 'entity_type')
    readonly_fields = (
        'tenant', 'actor', 'action', 'entity_type', 'entity_id',
        'message', 'reason', 'previous_value', 'new_value', 'created_at',
    )


@admin.register(Vendor)
class VendorAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('name', 'phone', 'is_active', 'tenant')
    search_fields = ('name', 'phone', 'email')


@admin.register(VendorBill)
class VendorBillAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('bill_no', 'vendor', 'bill_date', 'amount', 'status', 'tenant')
    list_filter = ('status',)


@admin.register(VendorPayment)
class VendorPaymentAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('payment_no', 'vendor', 'payment_date', 'amount', 'status', 'tenant')


@admin.register(BankAccount)
class BankAccountAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('bank_name', 'account_name', 'is_default', 'is_active', 'tenant')


@admin.register(BankTransfer)
class BankTransferAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('transfer_date', 'amount', 'from_account', 'to_account', 'status', 'tenant')


@admin.register(BankReconciliation)
class BankReconciliationAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('bank_account', 'statement_date', 'statement_balance', 'difference', 'status', 'tenant')


@admin.register(Invoice)
class InvoiceAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('invoice_no', 'customer', 'invoice_date', 'total', 'status', 'tenant')
    list_filter = ('status',)
