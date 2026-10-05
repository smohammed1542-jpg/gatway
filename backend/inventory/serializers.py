from django.db.models import Sum
from rest_framework import serializers
from .models import InventoryItem, BookingInventoryItem, InventoryTransaction


class InventoryItemSerializer(serializers.ModelSerializer):
    allocated_quantity = serializers.SerializerMethodField()
    available_quantity = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = '__all__'

    def get_allocated_quantity(self, obj):
        return obj.booking_allocations.aggregate(total=Sum('quantity_used'))['total'] or 0

    def get_available_quantity(self, obj):
        # Booking save already posts this quantity out of on-hand stock.
        return int(obj.quantity or 0)

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
    item_price = serializers.SerializerMethodField()
    booking_event = serializers.CharField(source='booking.event_name', read_only=True)

    class Meta:
        model = BookingInventoryItem
        fields = '__all__'
        read_only_fields = ['tenant']

    def get_item_price(self, obj):
        if obj.unit_price is not None:
            return obj.unit_price
        return obj.inventory_item.price_per_unit if obj.inventory_item_id else 0

    def validate(self, attrs):
        qty = attrs.get('quantity_used', self.instance.quantity_used if self.instance else 0)
        if qty is not None and int(qty) < 1:
            raise serializers.ValidationError(
                {'quantity_used': 'Quantity must be at least 1.'}
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
        if validated_data.get('unit_price') is None:
            item = validated_data.get('inventory_item')
            if item is not None:
                validated_data['unit_price'] = item.price_per_unit or 0
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
