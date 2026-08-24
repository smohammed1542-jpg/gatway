from rest_framework import serializers
from .models import Payment, Expense


class PaymentSerializer(serializers.ModelSerializer):
    booking_event_name = serializers.CharField(source='booking.event_name', read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    customer_cnic = serializers.SerializerMethodField()
    booking_reference = serializers.CharField(source='booking.booking_id', read_only=True)
    venue_name = serializers.CharField(source='booking.venue.name', read_only=True)
    event_date = serializers.DateField(source='booking.event_date', read_only=True)
    booking_slot = serializers.CharField(source='booking.slot', read_only=True)
    booking_status = serializers.CharField(source='booking.booking_status', read_only=True)
    booking_total = serializers.DecimalField(
        source='booking.total_price', max_digits=12, decimal_places=2, read_only=True
    )
    booking_paid = serializers.DecimalField(
        source='booking.advance_paid', max_digits=12, decimal_places=2, read_only=True
    )
    booking_remaining = serializers.DecimalField(
        source='booking.remaining_balance', max_digits=12, decimal_places=2, read_only=True
    )
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['tenant', 'payment_date', 'recorded_by']

    def get_customer_name(self, obj):
        if obj.booking and obj.booking.customer:
            return obj.booking.customer.display_name
        return ''

    def get_customer_phone(self, obj):
        if obj.booking and obj.booking.customer:
            return obj.booking.customer.phone or ''
        return ''

    def get_customer_cnic(self, obj):
        if obj.booking and obj.booking.customer:
            return getattr(obj.booking.customer, 'cnic', '') or obj.booking.cnic or ''
        return obj.booking.cnic if obj.booking else ''

    def get_recorded_by_name(self, obj):
        if not obj.recorded_by:
            return ''
        user = obj.recorded_by
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.email or 'Staff'

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            validated_data['recorded_by'] = request.user
            if hasattr(request.user, 'tenant') and request.user.tenant:
                validated_data['tenant'] = request.user.tenant

        return super().create(validated_data)


class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ['tenant', 'created_by', 'created_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return ''
        user = obj.created_by
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.username or user.email or 'Staff'

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
            if hasattr(request.user, 'tenant') and request.user.tenant:
                validated_data['tenant'] = request.user.tenant
        return super().create(validated_data)
