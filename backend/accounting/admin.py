from django.contrib import admin

from core.admin_mixins import TenantScopedAdminMixin
from .models import Account, FiscalPeriod, JournalEntry, JournalLine, Tax, AuditLog


class JournalLineInline(admin.TabularInline):
    model = JournalLine
    extra = 0
    readonly_fields = ('account', 'description', 'debit', 'credit')


@admin.register(Account)
class AccountAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('code', 'name', 'account_type', 'is_active', 'tenant')
    list_filter = ('account_type', 'is_active')
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
        'tenant', 'actor', 'action', 'entity_type', 'entity_id', 'message', 'created_at',
    )
