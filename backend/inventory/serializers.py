from django.db.models import Sum
from rest_framework import serializers
from .models import InventoryItem, BookingInventoryItem, InventoryTransaction


class InventoryItemSerializer(serializers.ModelSerializer):
    allocated_quantity = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = '__all__'

    def get_allocated_quantity(self, obj):
        return obj.booking_allocations.aggregate(total=Sum('quantity_used'))['total'] or 0

    def validate_name(self, value):
        name = str(value or '').strip()
        if not name:
            raise serializers.ValidationError('Item name is required.')
        request = self.context.get('request')
        tenant_id = getattr(getattr(request, 'user', None), 'tenant_id', None)
        matches = InventoryItem.objects.filter(tenant_id=tenant_id, name__iexact=name)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError('An inventory item with this name already exists.')
        return name


class BookingInventoryItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='inventory_item.name', read_only=True)
    item_unit = serializers.CharField(source='inventory_item.unit', read_only=True)
    item_price = serializers.DecimalField(
        source='inventory_item.price_per_unit',
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    booking_event = serializers.CharField(source='booking.event_name', read_only=True)

    class Meta:
        model = BookingInventoryItem
        fields = '__all__'
        read_only_fields = ['tenant']

    def validate(self, attrs):
        item = attrs.get('inventory_item') or (self.instance and self.instance.inventory_item)
        qty = attrs.get('quantity_used', self.instance.quantity_used if self.instance else 0)
        available = item.quantity if item else 0
        if (
            item
            and self.instance
            and self.instance.inventory_item_id == item.id
        ):
            available += self.instance.quantity_used
        if item and qty > available:
            raise serializers.ValidationError(
                {'quantity_used': f'Only {available} {item.unit} available in stock.'}
            )
        return attrs

    @staticmethod
    def _refresh_booking_totals(booking):
        if not booking:
            return
        booking.save()

    def create(self, validated_data):
        request = self.context.get('request')
        booking = validated_data['booking']
        if request and getattr(request.user, 'tenant_id', None):
            validated_data['tenant'] = request.user.tenant
        elif booking.tenant_id:
            validated_data['tenant'] = booking.tenant
        obj = super().create(validated_data)
        from .services import InventoryService
        InventoryService.apply_booking_allocation(
            obj, previous_qty=0, user=request.user if request else None
        )
        self._refresh_booking_totals(obj.booking)
        return obj

    def update(self, instance, validated_data):
        previous = instance.quantity_used
        obj = super().update(instance, validated_data)
        from .services import InventoryService
        request = self.context.get('request')
        user = request.user if request else None
        InventoryService.apply_booking_allocation(obj, previous_qty=previous, user=user)
        self._refresh_booking_totals(obj.booking)
        return obj


class InventoryTransactionSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = InventoryTransaction
        fields = [
            'id', 'item', 'item_name', 'booking', 'quantity', 'txn_type',
            'notes', 'created_by', 'created_at',
        ]
        read_only_fields = fields
