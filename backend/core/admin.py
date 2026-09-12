from django.contrib import admin

from core.admin_mixins import AdminOnlyAdminMixin, ManagerOnlyAdminMixin, TenantScopedAdminMixin

from .models import Tenant, UserSettings, NotificationLog


@admin.register(Tenant)
class TenantAdmin(AdminOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('name', 'subdomain', 'plan_type', 'is_active', 'sms_enabled', 'phone', 'created_at')
    list_filter = ('plan_type', 'is_active', 'sms_enabled')
    search_fields = ('name', 'subdomain', 'phone', 'address')
    readonly_fields = ('created_at', 'updated_at')

    fieldsets = (
        (None, {
            'fields': (
                'name', 'subdomain', 'plan_type', 'is_active', 'phone', 'address',
                'sms_enabled', 'default_country_code',
                'gh_default_check_in_time', 'gh_default_check_out_time',
            ),
            'description': (
                '<strong>Tenant</strong> = one organization (e.g. your centre). '
                'Scroll down on this page to control <strong>Guest House</strong> and '
                '<strong>Marriage Hall</strong> page show/hide and maintenance times for this tenant.'
            ),
        }),
        ('Booking summary lines', {
            'fields': (
                'show_summary_guests',
                'show_summary_rate_per_head',
                'show_summary_food_venue',
                'show_summary_combined_services',
                'show_summary_tax',
            ),
            'description': (
                'Show or hide booking summary rows on the reservation screen. '
                'Totals still calculate in the background even if a line is hidden.'
            ),
        }),
        ('Timestamps', {
            'classes': ('collapse',),
            'fields': ('created_at', 'updated_at'),
        }),
    )

    def get_inlines(self, request, obj):
        from guesthouse.admin import GuestHousePageLiveInline, GuestHousePageMaintenanceInline
        from bookings.admin import MarriageHallPageLiveInline, MarriageHallPageMaintenanceInline
        return [
            GuestHousePageLiveInline,
            GuestHousePageMaintenanceInline,
            MarriageHallPageLiveInline,
            MarriageHallPageMaintenanceInline,
        ]

    def get_object(self, request, object_id, from_field=None):
        obj = super().get_object(request, object_id, from_field)
        if obj:
            from guesthouse.page_visibility import ensure_tenant_gh_pages
            from bookings.page_visibility import ensure_tenant_hall_pages
            ensure_tenant_gh_pages(obj)
            ensure_tenant_hall_pages(obj)
        return obj


@admin.register(UserSettings)
class UserSettingsAdmin(AdminOnlyAdminMixin, admin.ModelAdmin):
    list_display = (
        'user', 'theme', 'language', 'timezone',
        'notify_new_bookings', 'notify_payments', 'sms_to_customers',
    )
    list_filter = ('theme', 'language', 'notify_new_bookings', 'notify_payments')
    search_fields = ('user__username', 'user__email')
    raw_id_fields = ('user',)


@admin.register(NotificationLog)
class NotificationLogAdmin(ManagerOnlyAdminMixin, TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = (
        'notification_type', 'status', 'recipient', 'tenant',
        'customer', 'booking', 'created_at', 'sent_at',
    )
    list_filter = ('notification_type', 'status', 'tenant')
    search_fields = ('recipient', 'message', 'error_message')
    readonly_fields = ('created_at', 'sent_at')
    raw_id_fields = ('tenant', 'booking', 'customer')
