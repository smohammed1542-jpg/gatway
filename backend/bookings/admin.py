from django.contrib import admin
from django.utils.safestring import mark_safe

from core.admin_mixins import AdminOnlyAdminMixin, TenantScopedAdminMixin
from core.maintenance_admin import MaintenanceUntilAdminMixin
from core.maintenance_forms import MarriageHallPageMaintenanceForm
from core.models import Tenant

from .models import (
    Booking,
    MarriageHallBookSummary,
    MarriageHallPageLive,
    MarriageHallPageMaintenance,
)
from .page_visibility import ensure_tenant_hall_pages, HALL_MODULE_KEYS, HALL_PAGE_KEYS


@admin.register(Booking)
class BookingAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = (
        'booking_id', 'event_name', 'customer', 'venue', 'event_date',
        'slot', 'booking_status', 'payment_status', 'total_price', 'advance_paid', 'tenant',
    )
    list_filter = ('booking_status', 'payment_status', 'slot', 'tenant', 'event_date')
    search_fields = (
        'booking_id', 'event_name', 'customer__full_name',
        'customer__first_name', 'customer__last_name', 'customer__phone',
    )
    readonly_fields = ('created_at', 'booking_id')
    raw_id_fields = ('customer', 'venue', 'decoration_package', 'created_by')
    date_hierarchy = 'event_date'
    fieldsets = (
        (None, {
            'fields': (
                'tenant', 'booking_id', 'customer', 'venue', 'event_name',
                'event_date', 'slot', 'booking_status', 'created_by',
            ),
        }),
        ('Pricing & payment status', {
            'fields': ('total_price', 'advance_paid', 'payment_status', 'decoration_package'),
            'description': 'Payment records are managed under Finance → Payments (Manager/Admin only).',
        }),
    )


class _HallPageAdminBase(AdminOnlyAdminMixin, admin.ModelAdmin):
    list_display_links = ('label',)
    list_filter = ('tenant',)
    search_fields = ('label', 'page_key', 'tenant__name')
    ordering = ('tenant__name', 'sort_order', 'page_key')
    list_per_page = 50
    list_select_related = ('tenant',)
    readonly_fields = ('page_key', 'label', 'sort_order', 'tenant')

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        for tenant in Tenant.objects.all():
            ensure_tenant_hall_pages(tenant)
        return super().changelist_view(request, extra_context=extra_context)


class MarriageHallPageLiveInline(admin.TabularInline):
    """Show/hide Marriage Hall sidebar pages inside Tenant edit screen."""
    model = MarriageHallPageLive
    extra = 0
    fields = ('label', 'page_key', 'is_visible')
    readonly_fields = ('label', 'page_key')
    ordering = ('sort_order',)
    can_delete = False
    verbose_name = 'Page'
    verbose_name_plural = (
        'Marriage Hall — <strong>Show in menu</strong> (sidebar pages only)'
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(page_key__in=HALL_PAGE_KEYS)

    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class MarriageHallBookSummaryInline(admin.TabularInline):
    """Show/hide booking summary bill lines inside Tenant edit screen."""
    model = MarriageHallBookSummary
    extra = 0
    fields = ('label', 'page_key', 'is_visible')
    readonly_fields = ('label', 'page_key')
    ordering = ('sort_order',)
    can_delete = False
    verbose_name = 'Line'
    verbose_name_plural = (
        'Book Summary — <strong>hide / show</strong> booking bill lines'
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(page_key__in=HALL_MODULE_KEYS)

    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class MarriageHallPageMaintenanceInline(admin.StackedInline):
    """Maintenance mode for Marriage Hall pages inside Tenant edit screen."""
    model = MarriageHallPageMaintenance
    form = MarriageHallPageMaintenanceForm
    extra = 0
    fields = ('label', 'page_key', 'in_maintenance', 'maintenance_until')
    readonly_fields = ('label', 'page_key')
    ordering = ('sort_order',)
    can_delete = False
    verbose_name = 'Page'
    verbose_name_plural = (
        'Marriage Hall — <strong>Maintenance & reopen time</strong> (set when page opens again)'
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(page_key__in=HALL_PAGE_KEYS)

    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MarriageHallPageLive)
class MarriageHallPageLiveAdmin(_HallPageAdminBase):
    """Tick Show in menu to display a page; untick to hide it."""

    list_display = ('label', 'page_key', 'tenant', 'live_badge', 'is_visible')
    list_editable = ('is_visible',)
    list_filter = ('tenant', 'is_visible')

    fieldsets = (
        (None, {
            'fields': ('tenant', 'label', 'page_key', 'is_visible', 'sort_order'),
            'description': (
                'Tick <strong>Show in menu</strong> to display this page in the app sidebar. '
                'Untick to hide it. Booking bill lines are managed under <strong>Book Summary</strong>.'
            ),
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(page_key__in=HALL_PAGE_KEYS)

    @admin.display(description='Status')
    def live_badge(self, obj):
        if obj.is_visible:
            return mark_safe('<span style="color:#15803d;font-weight:700;">Live</span>')
        return mark_safe('<span style="color:#64748b;font-weight:700;">Hidden</span>')

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['title'] = 'Marriage Hall — 1 · Show in menu'
        extra_context['subtitle'] = (
            '<strong>For:</strong> hiding or showing Marriage Hall pages in the app sidebar. '
            'Tick <strong>Show in menu</strong> = visible. Untick = hidden. Save at the bottom.'
        )
        return super().changelist_view(request, extra_context=extra_context)


@admin.register(MarriageHallBookSummary)
class MarriageHallBookSummaryAdmin(_HallPageAdminBase):
    """Show or hide individual Booking Summary bill lines."""

    list_display = ('label', 'page_key', 'tenant', 'live_badge', 'is_visible')
    list_editable = ('is_visible',)
    list_filter = ('tenant', 'is_visible')
    list_display_links = ('label',)

    fieldsets = (
        (None, {
            'fields': ('tenant', 'label', 'page_key', 'is_visible', 'sort_order'),
            'description': (
                'Untick <strong>Show</strong> to hide that line on the Bookings summary panel. '
                'Totals still calculate in the background. Save at the bottom, then refresh the app.'
            ),
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(page_key__in=HALL_MODULE_KEYS)

    @admin.display(description='Status')
    def live_badge(self, obj):
        if obj.is_visible:
            return mark_safe('<span style="color:#15803d;font-weight:700;">Shown</span>')
        return mark_safe('<span style="color:#64748b;font-weight:700;">Hidden</span>')

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        formfield = super().formfield_for_dbfield(db_field, request, **kwargs)
        if db_field.name == 'is_visible' and formfield is not None:
            formfield.label = 'Show on bill'
        return formfield

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['title'] = 'Book Summary — hide / show lines'
        extra_context['subtitle'] = (
            '<strong>For:</strong> Guaranteed Guests, Rate / Head, Venue, Combined Services, '
            'and Tax (5% GST) on the Bookings reservation summary. '
            'Untick = hide that line. Tick = show. Save at the bottom.'
        )
        return super().changelist_view(request, extra_context=extra_context)


@admin.register(MarriageHallPageMaintenance)
class MarriageHallPageMaintenanceAdmin(MaintenanceUntilAdminMixin, _HallPageAdminBase):
    """Tick Maintenance mode and set when the page should reopen automatically."""

    form = MarriageHallPageMaintenanceForm
    list_display = (
        'label', 'page_key', 'tenant', 'maintenance_badge',
        'ends_at_display', 'in_maintenance', 'maintenance_until',
    )
    list_editable = ('in_maintenance', 'maintenance_until')

    fieldsets = (
        (None, {
            'fields': ('tenant', 'label', 'page_key', 'in_maintenance', 'maintenance_until', 'sort_order'),
            'description': (
                'Tick <strong>Maintenance mode</strong>, then open a row to set '
                '<strong>Maintenance ends at</strong> using the date and 12-hour '
                '(AM/PM) time dropdowns.'
            ),
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(page_key__in=HALL_PAGE_KEYS)

    @admin.display(description='Status')
    def maintenance_badge(self, obj):
        if obj.in_maintenance:
            return mark_safe('<span style="color:#b45309;font-weight:700;">Maintenance</span>')
        return mark_safe('<span style="color:#15803d;font-weight:700;">Normal</span>')

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['title'] = 'Marriage Hall — 2 · Maintenance & reopen time'
        extra_context['subtitle'] = (
            '<strong>For:</strong> putting pages under maintenance and scheduling when they reopen. '
            'Tick maintenance, pick <strong>date</strong> and <strong>time (AM/PM)</strong>, then Save. '
            'Saved time appears in the <strong>Saved end time</strong> column.'
        )
        return super().changelist_view(request, extra_context=extra_context)
