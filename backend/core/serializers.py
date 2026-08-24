from rest_framework import serializers
from .models import Tenant, UserSettings, NotificationLog


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'subdomain', 'plan_type', 'phone', 'address',
            'sms_enabled', 'default_country_code',
            'gh_default_check_in_time', 'gh_default_check_out_time',
            'tax_rate', 'overtime_rate_per_hour', 'default_currency',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'subdomain', 'plan_type', 'created_at', 'updated_at']


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = [
            'notify_new_bookings', 'notify_payments',
            'notify_weekly_reports', 'notify_staff_activity',
            'sms_to_customers', 'whatsapp_to_customers',
            'timezone', 'language', 'theme',
        ]


class NotificationLogSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    booking_reference = serializers.CharField(source='booking.booking_id', read_only=True)

    class Meta:
        model = NotificationLog
        fields = '__all__'
        read_only_fields = [
            'id', 'tenant', 'booking', 'customer', 'notification_type', 'status',
            'recipient', 'message', 'error_message', 'created_at', 'sent_at',
            'customer_name', 'booking_reference',
        ]

    def get_customer_name(self, obj):
        if obj.customer:
            return getattr(obj.customer, 'display_name', str(obj.customer))
        return ''
