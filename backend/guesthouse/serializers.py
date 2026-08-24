from decimal import Decimal

from rest_framework import serializers
from django.db.models import Sum
from .models import (
    Room, RoomBed, UnitMedia, Amenity, UnitAmenity,
    StayBooking, StayPayment, GhExpense,
    GuestHouseService, StayCharge, StayGuest,
)
from .billing import compute_service_amount, get_included_guests, get_max_guests, compute_room_charges
from .availability import blocked_unit_ids, conflict_message
from .guest_roster import sync_stay_guests, ensure_primary_guest_row, _guest_entry_filled, _enrich_guest_entry


class RoomBedSerializer(serializers.ModelSerializer):
    bed_type_display = serializers.CharField(source='get_bed_type_display', read_only=True)

    class Meta:
        model = RoomBed
        fields = ['id', 'bed_type', 'bed_type_display', 'quantity']
        read_only_fields = ['id', 'bed_type_display']


class UnitMediaSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = UnitMedia
        fields = [
            'id', 'unit', 'unit_type', 'file', 'url',
            'caption', 'sort_order', 'is_cover', 'created_at',
        ]
        read_only_fields = ['id', 'unit', 'unit_type', 'url', 'created_at']

    def get_url(self, obj):
        if not obj.file:
            return ''
        request = self.context.get('request')
        url = obj.file.url
        if request:
            return request.build_absolute_uri(url)
        return url


class AmenitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Amenity
        fields = ['id', 'name', 'code', 'sort_order', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class RoomSerializer(serializers.ModelSerializer):
    effective_included_guests = serializers.SerializerMethodField()
    effective_max_guests = serializers.SerializerMethodField()
    is_suite = serializers.SerializerMethodField()
    is_independent = serializers.SerializerMethodField()
    parent_number = serializers.CharField(source='parent.room_number', read_only=True, default='')
    children_count = serializers.SerializerMethodField()
    bed_configs = RoomBedSerializer(many=True, required=False)
    media = UnitMediaSerializer(many=True, read_only=True)
    image = serializers.SerializerMethodField()
    amenity_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Amenity.objects.none(),
        required=False,
        write_only=True,
    )
    amenities = AmenitySerializer(many=True, read_only=True)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.none(),
        allow_null=True,
        required=False,
    )
    addon_service_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=GuestHouseService.objects.none(),
        source='addon_services',
        required=False,
    )

    class Meta:
        model = Room
        fields = [
            'id', 'parent', 'parent_number', 'unit_kind', 'is_suite', 'is_independent',
            'room_number', 'room_type', 'beds', 'included_guests', 'max_guests',
            'extra_bed_allowed', 'extra_bed_limit',
            'extra_guest_fee_per_night', 'effective_included_guests', 'effective_max_guests',
            'price_per_night', 'description', 'image', 'media',
            'amenity_ids', 'amenities',
            'status', 'housekeeping_status', 'sellable', 'children_count',
            'bed_configs', 'addon_service_ids',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'effective_included_guests',
            'effective_max_guests', 'is_suite', 'is_independent', 'parent_number',
            'children_count', 'image', 'media', 'amenities',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        tenant_id = getattr(getattr(request, 'user', None), 'tenant_id', None)
        if tenant_id:
            addon_qs = GuestHouseService.objects.filter(
                tenant_id=tenant_id,
                is_active=True,
            )
            addon_field = self.fields['addon_service_ids']
            addon_field.queryset = addon_qs
            if getattr(addon_field, 'child_relation', None) is not None:
                addon_field.child_relation.queryset = addon_qs
            amenity_qs = Amenity.objects.filter(tenant_id=tenant_id, is_active=True)
            amenity_field = self.fields['amenity_ids']
            amenity_field.queryset = amenity_qs
            if getattr(amenity_field, 'child_relation', None) is not None:
                amenity_field.child_relation.queryset = amenity_qs
            self.fields['parent'].queryset = Room.objects.filter(
                tenant_id=tenant_id,
                unit_kind='SUITE',
            )

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
        beds = data.get('bed_configs')
        if isinstance(beds, str):
            import json
            try:
                data['bed_configs'] = json.loads(beds) if beds.strip() else []
            except json.JSONDecodeError as exc:
                raise serializers.ValidationError({'bed_configs': 'Invalid bed configuration.'}) from exc
        parent = data.get('parent')
        if parent in ('', 'null', 'None'):
            data['parent'] = None
        # Legacy clients may still POST image — ignore; use UnitMedia endpoints.
        if hasattr(data, 'pop'):
            data.pop('image', None)
        return super().to_internal_value(data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.pk:
            data['addon_service_ids'] = list(
                instance.addon_services.filter(is_active=True).values_list('id', flat=True)
            )
            data['amenity_ids'] = list(instance.amenities.values_list('id', flat=True))
        return data

    def get_image(self, obj):
        """Cover photo URL for backward-compatible list/booking cards."""
        request = self.context.get('request')
        cover = None
        if obj.pk:
            media_qs = obj.media.all()
            cover = next((m for m in media_qs if m.is_cover), None) or next(iter(media_qs), None)
        if cover and cover.file:
            url = cover.file.url
            return request.build_absolute_uri(url) if request else url
        if obj.image:
            url = obj.image.url
            return request.build_absolute_uri(url) if request else url
        return None

    def get_effective_included_guests(self, obj):
        return get_included_guests(obj)

    def get_effective_max_guests(self, obj):
        return get_max_guests(obj)

    def get_is_suite(self, obj):
        return obj.is_suite

    def get_is_independent(self, obj):
        return obj.is_independent_room

    def get_children_count(self, obj):
        if not obj.is_suite:
            return 0
        return obj.children.count()

    def validate(self, attrs):
        unit_kind = attrs.get('unit_kind', getattr(self.instance, 'unit_kind', 'ROOM'))
        parent = attrs.get('parent', getattr(self.instance, 'parent', None))
        room_type = attrs.get('room_type', getattr(self.instance, 'room_type', 'DOUBLE'))

        if unit_kind == 'SUITE':
            attrs['parent'] = None
            if room_type != 'SUITE':
                attrs['room_type'] = 'SUITE'
        elif parent is not None:
            if getattr(parent, 'unit_kind', None) != 'SUITE' and not getattr(parent, 'is_suite', False):
                raise serializers.ValidationError({'parent': 'Parent must be a suite.'})
            if self.instance and parent.pk == self.instance.pk:
                raise serializers.ValidationError({'parent': 'A unit cannot be its own parent.'})

        max_guests = attrs.get('max_guests', getattr(self.instance, 'max_guests', 0) or 0)
        included = attrs.get('included_guests', getattr(self.instance, 'included_guests', 0) or 0)
        if max_guests and included and max_guests < included:
            raise serializers.ValidationError({
                'max_guests': 'Max guests cannot be less than included guests.',
            })
        return attrs

    def _sync_beds(self, room, bed_configs):
        if bed_configs is None:
            return
        room.bed_configs.all().delete()
        total = 0
        for row in bed_configs:
            qty = int(row.get('quantity') or 1)
            if qty < 1:
                continue
            RoomBed.objects.create(
                room=room,
                bed_type=row.get('bed_type') or 'QUEEN',
                quantity=qty,
            )
            total += qty
        if total > 0:
            room.beds = total
            room.save(update_fields=['beds', 'updated_at'])

    def create(self, validated_data):
        bed_configs = validated_data.pop('bed_configs', None)
        addon_services = validated_data.pop('addon_services', None)
        amenity_ids = validated_data.pop('amenity_ids', None)
        validated_data.pop('image', None)
        room = Room.objects.create(**validated_data)
        if addon_services is not None:
            room.addon_services.set(addon_services)
        if amenity_ids is not None:
            room.amenities.set(amenity_ids)
        self._sync_beds(room, bed_configs)
        return room

    def update(self, instance, validated_data):
        bed_configs = validated_data.pop('bed_configs', None)
        addon_services = validated_data.pop('addon_services', None)
        amenity_ids = validated_data.pop('amenity_ids', None)
        validated_data.pop('image', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if addon_services is not None:
            instance.addon_services.set(addon_services)
        if amenity_ids is not None:
            instance.amenities.set(amenity_ids)
        if bed_configs is not None:
            self._sync_beds(instance, bed_configs)
        return instance


class GuestHouseServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = GuestHouseService
        fields = [
            'id', 'code', 'label', 'price', 'pricing_unit',
            'is_active', 'sort_order', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class StayChargeSerializer(serializers.ModelSerializer):
    service_label = serializers.CharField(source='service.label', read_only=True, default='')

    class Meta:
        model = StayCharge
        fields = [
            'id', 'charge_type', 'description', 'service', 'service_label',
            'quantity', 'unit_price', 'amount', 'created_at',
        ]
        read_only_fields = ['id', 'amount', 'created_at', 'service_label']


class StayGuestSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = StayGuest
        fields = [
            'id', 'customer', 'customer_name', 'full_name', 'cnic', 'phone', 'address',
            'is_minor', 'is_primary', 'sort_order',
        ]
        read_only_fields = ['id', 'sort_order', 'customer_name']

    def get_customer_name(self, obj):
        if obj.customer_id:
            return obj.customer.display_name
        return obj.full_name


class StayGuestWriteSerializer(serializers.Serializer):
    customer = serializers.IntegerField(required=False, allow_null=True)
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    cnic = serializers.CharField(required=False, allow_blank=True, max_length=20)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    address = serializers.CharField(required=False, allow_blank=True)
    is_minor = serializers.BooleanField(required=False, default=False)
    linked_primary = serializers.IntegerField(required=False, allow_null=True)
    is_primary = serializers.BooleanField(required=False, default=False)


class StayPaymentSerializer(serializers.ModelSerializer):
    stay_ref = serializers.CharField(source='stay.booking_ref', read_only=True)
    customer_name = serializers.SerializerMethodField()
    room_number = serializers.CharField(source='stay.room.room_number', read_only=True)
    stay_total = serializers.DecimalField(source='stay.total_amount', max_digits=12, decimal_places=2, read_only=True)
    stay_paid = serializers.DecimalField(source='stay.advance_paid', max_digits=12, decimal_places=2, read_only=True)
    stay_remaining = serializers.DecimalField(source='stay.remaining_balance', max_digits=12, decimal_places=2, read_only=True)
    check_in = serializers.DateField(source='stay.check_in', read_only=True)
    check_out = serializers.DateField(source='stay.check_out', read_only=True)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StayPayment
        fields = '__all__'
        read_only_fields = ['tenant', 'payment_date', 'recorded_by', 'receipt_ref']

    def get_customer_name(self, obj):
        if obj.stay and obj.stay.customer:
            return obj.stay.customer.display_name
        return ''

    def get_recorded_by_name(self, obj):
        if not obj.recorded_by:
            return ''
        user = obj.recorded_by
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.username

    def validate(self, attrs):
        stay = attrs.get('stay') or getattr(self.instance, 'stay', None)
        amount = attrs.get('amount', getattr(self.instance, 'amount', None))
        status = attrs.get('status', getattr(self.instance, 'status', 'COMPLETED'))
        if stay and amount is not None and status == 'COMPLETED':
            amt = Decimal(str(amount))
            paid = stay.payments.filter(status='COMPLETED').aggregate(t=Sum('amount'))['t'] or Decimal('0')
            if self.instance:
                paid -= Decimal(str(self.instance.amount))
            if amt < 0:
                if abs(amt) > max(paid, Decimal('0')):
                    raise serializers.ValidationError({
                        'amount': f'Refund cannot exceed amount paid (Rs {max(paid, Decimal("0"))}).',
                    })
            else:
                remaining = Decimal(str(stay.total_amount)) - max(paid, Decimal('0'))
                if amt > remaining:
                    raise serializers.ValidationError({
                        'amount': f'Amount exceeds remaining balance (Rs {remaining}).',
                    })
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['recorded_by'] = request.user
            if request.user.tenant_id:
                validated_data['tenant'] = request.user.tenant
        return super().create(validated_data)


class GhExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = GhExpense
        fields = '__all__'
        read_only_fields = ['tenant', 'created_by', 'created_at', 'created_by_name']

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ''
        user = obj.created_by
        name = f'{user.first_name or ""} {user.last_name or ""}'.strip()
        return name or user.username

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['created_by'] = request.user
            if request.user.tenant_id:
                validated_data['tenant'] = request.user.tenant
        return super().create(validated_data)


class StayBookingSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source='customer.phone', read_only=True)
    customer_cnic = serializers.CharField(source='customer.cnic', read_only=True)
    customer_gender = serializers.CharField(source='customer.gender', read_only=True)
    customer_relative_relation = serializers.CharField(source='customer.relative_relation', read_only=True)
    customer_relative_name = serializers.CharField(source='customer.relative_name', read_only=True)
    room_number = serializers.CharField(source='room.room_number', read_only=True)
    room_type = serializers.CharField(source='room.room_type', read_only=True)
    price_per_night = serializers.DecimalField(source='room.price_per_night', max_digits=12, decimal_places=2, read_only=True)
    included_guests = serializers.SerializerMethodField()
    extra_guest_fee_per_night = serializers.DecimalField(
        source='room.extra_guest_fee_per_night', max_digits=12, decimal_places=2, read_only=True,
    )
    nights = serializers.IntegerField(read_only=True)
    remaining_balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    charges = StayChargeSerializer(many=True, read_only=True)
    guests = StayGuestSerializer(source='guest_roster', many=True, read_only=True)
    guest_roster = StayGuestWriteSerializer(many=True, write_only=True, required=False)
    billing_breakdown = serializers.SerializerMethodField()
    addon_service_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
    )
    advance_payment_method = serializers.ChoiceField(
        choices=StayPayment.METHOD_CHOICES,
        default='CASH',
        write_only=True,
        required=False,
    )

    class Meta:
        model = StayBooking
        fields = [
            'id', 'booking_ref', 'customer', 'customer_name', 'customer_phone', 'customer_cnic',
            'customer_gender', 'customer_relative_relation', 'customer_relative_name',
            'room', 'room_number', 'room_type', 'price_per_night',
            'included_guests', 'extra_guest_fee_per_night',
            'check_in', 'check_out', 'guests_count', 'adults_count', 'children_count', 'nights', 'total_amount',
            'advance_paid', 'advance_payment_method', 'addon_service_ids',
            'remaining_balance', 'charges', 'guests', 'guest_roster', 'billing_breakdown',
            'status', 'payment_status', 'notes',
            'cancellation_reason', 'cancelled_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'booking_ref', 'customer_name', 'customer_phone', 'customer_cnic',
            'customer_gender', 'customer_relative_relation', 'customer_relative_name',
            'room_number',
            'room_type', 'price_per_night', 'included_guests', 'extra_guest_fee_per_night',
            'nights', 'remaining_balance', 'total_amount', 'advance_paid',
            'payment_status', 'charges', 'guests', 'billing_breakdown',
            'cancellation_reason', 'cancelled_at',
            'created_at', 'updated_at',
        ]

    def get_customer_name(self, obj):
        return obj.customer.display_name if obj.customer_id else ''

    def get_included_guests(self, obj):
        if obj.room_id:
            return get_included_guests(obj.room)
        return 1

    def get_billing_breakdown(self, obj):
        if not obj.room_id or not obj.check_in or not obj.check_out:
            return None
        room = obj.room
        nights = obj.nights
        guests = max(int(obj.guests_count or 1), 1)
        room_charges = compute_room_charges(room, nights, guests)
        room_guest_total = room_charges['room_total']

        service_lines = []
        custom_lines = []
        service_total = Decimal('0')
        custom_total = Decimal('0')
        if obj.pk:
            for charge in obj.charges.all():
                amt = Decimal(str(charge.amount))
                line = {
                    'id': charge.id,
                    'description': charge.description,
                    'amount': float(amt),
                    'charge_type': charge.charge_type,
                    'service_id': charge.service_id,
                }
                if charge.charge_type == 'CUSTOM':
                    custom_total += amt
                    custom_lines.append(line)
                else:
                    service_total += amt
                    service_lines.append(line)

        return {
            'nights': nights,
            'guests': guests,
            'price_per_guest_per_night': float(room_charges['price_per_night']),
            'room_guest_total': float(room_guest_total),
            'included_guests': room_charges['included_guests'],
            'extra_guests': room_charges['extra_guests'],
            'extra_guest_fee_per_night': float(room_charges['extra_guest_fee_per_night']),
            'room_base': float(room_charges['room_base']),
            'extra_guest_total': float(room_charges['extra_guest_total']),
            'service_charges': service_lines,
            'service_total': float(service_total),
            'custom_charges': custom_lines,
            'custom_total': float(custom_total),
            'total': float(obj.total_amount),
        }

    def _parse_addon_ids(self):
        if 'addon_service_ids' not in self.initial_data:
            return None
        raw = self.initial_data.get('addon_service_ids') or []
        if isinstance(raw, str):
            raw = [x.strip() for x in raw.split(',') if x.strip()]
        return [int(x) for x in raw]

    def _sync_addon_charges(self, stay, service_ids):
        stay.charges.filter(charge_type='SERVICE').delete()
        if not service_ids:
            return
        tenant_id = stay.tenant_id
        services = GuestHouseService.objects.filter(
            tenant_id=tenant_id, id__in=service_ids, is_active=True,
        )
        nights = stay.nights
        guests = stay.guests_count
        for svc in services:
            amount = compute_service_amount(svc, nights, guests)
            StayCharge.objects.create(
                stay=stay,
                service=svc,
                charge_type='SERVICE',
                description=svc.label,
                quantity=1,
                unit_price=svc.price,
                amount=amount,
            )

    def _estimate_total(self, room, check_in, check_out, guests_count, addon_ids=None):
        nights = max((check_out - check_in).days, 1)
        room_charges = compute_room_charges(room, nights, guests_count)
        service_total = Decimal('0')
        if addon_ids:
            tenant_id = room.tenant_id
            for svc in GuestHouseService.objects.filter(
                tenant_id=tenant_id, id__in=addon_ids, is_active=True,
            ):
                service_total += compute_service_amount(svc, nights, guests_count)
        return room_charges['room_total'] + service_total

    def _parse_guest_roster(self):
        if 'guest_roster' not in self.initial_data:
            return None
        raw = self.initial_data.get('guest_roster') or []
        if not isinstance(raw, list):
            return []
        tenant = getattr(getattr(self.context.get('request'), 'user', None), 'tenant', None)
        cleaned = []
        for entry in raw:
            if not _guest_entry_filled(entry):
                continue
            cleaned.append(_enrich_guest_entry(entry, tenant))
        return cleaned

    def validate(self, attrs):
        check_in = attrs.get('check_in') or getattr(self.instance, 'check_in', None)
        check_out = attrs.get('check_out') or getattr(self.instance, 'check_out', None)
        room = attrs.get('room') or getattr(self.instance, 'room', None)
        requested_guests = int(attrs.get('guests_count') or getattr(self.instance, 'guests_count', 1) or 1)
        guest_roster = self._parse_guest_roster()
        if guest_roster is not None:
            if not guest_roster:
                raise serializers.ValidationError({'guest_roster': 'At least one guest is required.'})
            primary_rows = [g for g in guest_roster if g.get('is_primary')]
            if not primary_rows:
                guest_roster[0]['is_primary'] = True
            elif len(primary_rows) > 1:
                raise serializers.ValidationError({'guest_roster': 'Only one primary guest is allowed.'})
            for index, guest in enumerate(guest_roster):
                name = (guest.get('full_name') or '').strip()
                cnic = (guest.get('cnic') or '').strip()
                address = (guest.get('address') or '').strip()
                is_minor = bool(guest.get('is_minor'))
                is_primary = bool(guest.get('is_primary')) or index == 0
                if not guest.get('customer') and not name:
                    raise serializers.ValidationError({
                        'guest_roster': f'Guest {index + 1}: name is required.',
                    })
                if is_primary and not cnic and not guest.get('customer'):
                    raise serializers.ValidationError({
                        'guest_roster': 'Primary guest CNIC is required.',
                    })
                if is_primary and guest.get('customer') and not cnic:
                    raise serializers.ValidationError({
                        'guest_roster': 'Primary guest profile is missing CNIC. Update the guest profile.',
                    })
                if not is_primary and is_minor:
                    if not guest.get('customer') and not address:
                        raise serializers.ValidationError({
                            'guest_roster': f'Guest {index + 1}: address is required for guests under 18.',
                        })
                elif not is_primary and not guest.get('customer') and not cnic:
                    raise serializers.ValidationError({
                        'guest_roster': f'Guest {index + 1}: CNIC is required for guests aged 18+.',
                    })
            attrs['guests_count'] = len(guest_roster)
        if 'adults_count' in attrs or 'adults_count' in self.initial_data:
            adults = max(
                int(attrs.get('adults_count', getattr(self.instance, 'adults_count', 1) or 1)),
                1,
            )
            children = max(
                int(attrs.get('children_count', getattr(self.instance, 'children_count', 0) or 0)),
                0,
            )
            attrs['adults_count'] = adults
            attrs['children_count'] = children
            family_total = adults + children
            current_guests = int(attrs.get('guests_count') or requested_guests or 1)
            attrs['guests_count'] = max(current_guests, family_total)
        guests_count = attrs.get('guests_count') or requested_guests
        if check_in and check_out and check_out <= check_in:
            raise serializers.ValidationError({'check_out': 'Check-out must be after check-in.'})
        if room and check_in and check_out and room.status != 'ACTIVE':
            raise serializers.ValidationError({'room': 'Selected room is not available for booking.'})
        if room and getattr(room, 'sellable', True) is False:
            raise serializers.ValidationError({'room': 'This unit cannot be booked.'})
        customer = attrs.get('customer') or getattr(self.instance, 'customer', None)
        if customer and getattr(customer, 'list_status', 'NORMAL') == 'BLOCKLISTED':
            raise serializers.ValidationError({
                'customer': 'This customer is blocklisted and cannot be booked.',
            })
        if room and guests_count:
            max_guests = get_max_guests(room)
            if int(guests_count) > max_guests:
                raise serializers.ValidationError({
                    'guests_count': f'This unit allows at most {max_guests} guests.',
                })
        if room and check_in and check_out:
            tenant = room.tenant
            exclude_pk = self.instance.pk if self.instance else None
            blocked = blocked_unit_ids(tenant, check_in, check_out, exclude_stay=exclude_pk)
            if room.id in blocked:
                raise serializers.ValidationError({'room': conflict_message(room)})
        advance = attrs.get('advance_paid')
        addon_ids = self._parse_addon_ids()
        if addon_ids and room:
            allowed = set(
                room.addon_services.filter(is_active=True).values_list('id', flat=True)
            )
            invalid = [aid for aid in addon_ids if aid not in allowed]
            if invalid:
                raise serializers.ValidationError({
                    'addon_service_ids': 'One or more add-ons are not available for this room.',
                })
        if advance is not None and not self.instance and room and check_in and check_out:
            total = self._estimate_total(room, check_in, check_out, guests_count, addon_ids or [])
            if Decimal(str(advance)) > total:
                raise serializers.ValidationError({
                    'advance_paid': f'Advance cannot exceed stay total (Rs {total}).',
                })
        return attrs

    def create(self, validated_data):
        validated_data.pop('advance_payment_method', None)
        guest_roster = validated_data.pop('guest_roster', None)
        if guest_roster is None:
            guest_roster = self._parse_guest_roster()
        addon_ids = validated_data.pop('addon_service_ids', None)
        if addon_ids is None:
            addon_ids = self._parse_addon_ids() or []
        stay = StayBooking.objects.create(**validated_data)
        if guest_roster is not None:
            sync_stay_guests(stay, guest_roster)
        else:
            ensure_primary_guest_row(stay)
        self._sync_addon_charges(stay, addon_ids)
        stay.recalculate_total()
        stay.save()
        return stay

    def update(self, instance, validated_data):
        if instance.status in ('CANCELLED', 'CHECKED_OUT'):
            raise serializers.ValidationError(
                'Posted or cancelled stays cannot be modified.'
            )
        validated_data.pop('advance_payment_method', None)
        guest_roster = validated_data.pop('guest_roster', None)
        if guest_roster is None and 'guest_roster' in self.initial_data:
            guest_roster = self._parse_guest_roster()
        addon_ids = validated_data.pop('addon_service_ids', None)
        if addon_ids is None and 'addon_service_ids' in self.initial_data:
            addon_ids = self._parse_addon_ids() or []

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if guest_roster is not None:
            sync_stay_guests(instance, guest_roster)

        if addon_ids is not None:
            self._sync_addon_charges(instance, addon_ids)
            instance.recalculate_total()
            instance.save()
        elif any(k in validated_data for k in ('room', 'check_in', 'check_out', 'guests_count')):
            self._refresh_service_charge_amounts(instance)
            instance.recalculate_total()
            instance.save()

        return instance

    def _refresh_service_charge_amounts(self, stay):
        nights = stay.nights
        guests = stay.guests_count
        for charge in stay.charges.filter(charge_type='SERVICE').select_related('service'):
            if charge.service_id:
                charge.amount = compute_service_amount(charge.service, nights, guests)
                charge.save(update_fields=['amount'])
