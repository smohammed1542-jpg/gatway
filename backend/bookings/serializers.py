from rest_framework import serializers
from .models import Booking
from venues.models import Venue
from django.db.models import Q
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
import datetime


class BookingSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    venue_name = serializers.SerializerMethodField()
    venue_capacity = serializers.SerializerMethodField()
    venue_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)
    decoration_package_name = serializers.CharField(source='decoration_package.name', read_only=True, allow_null=True)

    class Meta:
        model = Booking
        fields = '__all__'
        read_only_fields = ['tenant', 'created_by', 'remaining_balance', 'payment_status', 'guest_count', 'updated_at']
        extra_kwargs = {
            'customer': {'required': False, 'allow_null': True},
            'venue': {'required': False, 'allow_null': True},
            'event_name': {'required': False, 'allow_blank': True},
            'slot': {'required': False, 'allow_blank': True, 'allow_null': True},
            'event_date': {'required': False, 'allow_null': True},
            'additional_venues': {'read_only': True},
        }

    def get_customer_name(self, obj):
        if not obj.customer_id:
            return 'Draft — no client'
        return str(obj.customer)

    def _halls_for(self, obj):
        return obj.hall_list() if obj else []

    def get_venue_name(self, obj):
        names = [hall.name for hall in self._halls_for(obj)]
        return ' + '.join(names) if names else '—'

    def get_venue_capacity(self, obj):
        halls = self._halls_for(obj)
        if not halls:
            return None
        return sum(int(hall.capacity or 0) for hall in halls)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['venue_ids'] = instance.hall_ids()
        data.pop('additional_venues', None)
        return data

    def _parse_venue_ids(self, value):
        if value in (None, '', 'null', 'undefined'):
            return None
        if isinstance(value, str):
            value = [part.strip() for part in value.split(',') if part.strip()]
        ids = []
        seen = set()
        for item in value:
            if item in ('', None, 'null', 'undefined'):
                continue
            vid = int(item)
            if vid in seen:
                continue
            seen.add(vid)
            ids.append(vid)
        return ids

    def _apply_venue_ids(self, booking, venue_ids):
        ids = self._parse_venue_ids(venue_ids) or []
        first = ids[0] if ids else None
        rest = ids[1:]
        if booking.venue_id != first:
            booking.venue_id = first
            booking.save(update_fields=['venue'])
        booking.additional_venues.set(rest)

    def to_internal_value(self, data):
        # HTML clients commonly submit hidden optional time inputs as empty strings.
        # Normalize them before DRF's TimeField parsing runs.
        normalized = data.copy()
        incoming_ids = None
        if hasattr(normalized, 'pop'):
            incoming_ids = normalized.get('venue_ids')
        for field in ('custom_start_time', 'custom_end_time', 'event_date', 'booking_date'):
            if normalized.get(field) == '':
                normalized[field] = None
        for field in ('customer', 'venue', 'decoration_package'):
            if normalized.get(field) in ('', 'null', 'undefined'):
                normalized[field] = None
        parsed_ids = self._parse_venue_ids(incoming_ids) if incoming_ids is not None else None
        if parsed_ids:
            normalized['venue'] = parsed_ids[0]
        elif parsed_ids is not None:
            normalized['venue'] = None
        if hasattr(normalized, 'pop'):
            normalized.pop('additional_venues', None)
        if normalized.get('slot') in ('', None, 'null', 'undefined'):
            normalized['slot'] = None
        if not normalized.get('booking_date'):
            from datetime import date as date_cls
            normalized['booking_date'] = date_cls.today().isoformat()
        if normalized.get('event_name') in (None, ''):
            status = normalized.get('booking_status') or getattr(self.instance, 'booking_status', 'PENDING')
            if status in ('DRAFT', 'PENDING'):
                normalized['event_name'] = 'Draft'
        ret = super().to_internal_value(normalized)
        if parsed_ids is not None:
            ret['venue_ids'] = parsed_ids
        return ret

    def validate(self, data):
        instance = self.instance
        merged_status = data.get(
            'booking_status',
            getattr(instance, 'booking_status', 'PENDING'),
        )
        # DRAFT always soft. Incomplete PENDING (legacy clients) also soft.
        if merged_status == 'DRAFT':
            is_draft = True
        elif merged_status == 'PENDING':
            cust = data.get('customer', getattr(instance, 'customer', None) if instance else None)
            ven = data.get('venue', getattr(instance, 'venue', None) if instance else None)
            is_draft = not cust or not ven
        else:
            is_draft = False

        venue = data.get('venue', getattr(instance, 'venue', None) if instance else None)
        venue_ids = data.get('venue_ids')
        if venue_ids is None:
            venue_ids = instance.hall_ids() if instance else ([venue.id] if venue else [])
        else:
            venue_ids = self._parse_venue_ids(venue_ids) or []
            if venue_ids:
                venue = Venue.objects.filter(pk=venue_ids[0]).first()
                data['venue'] = venue
            else:
                venue = None
                data['venue'] = None
        halls = list(Venue.objects.filter(pk__in=venue_ids)) if venue_ids else []
        halls_by_id = {hall.id: hall for hall in halls}
        ordered_halls = [halls_by_id[vid] for vid in venue_ids if vid in halls_by_id]
        combined_capacity = sum(int(hall.capacity or 0) for hall in ordered_halls)
        event_date = data.get('event_date', getattr(instance, 'event_date', None) if instance else None)
        slot = data.get('slot', getattr(instance, 'slot', None) if instance else None) or ''
        custom_start_time = data.get(
            'custom_start_time',
            getattr(instance, 'custom_start_time', None) if instance else None,
        )
        custom_end_time = data.get(
            'custom_end_time',
            getattr(instance, 'custom_end_time', None) if instance else None,
        )
        gents_count = data.get('gents_count', getattr(instance, 'gents_count', 0) if instance else 0)
        ladies_count = data.get('ladies_count', getattr(instance, 'ladies_count', 0) if instance else 0)
        guest_count = (gents_count or 0) + (ladies_count or 0)
        customer = data.get('customer', getattr(instance, 'customer', None) if instance else None)

        if not is_draft:
            if not customer:
                raise serializers.ValidationError({'customer': 'Customer is required to confirm a booking.'})
            if not venue:
                raise serializers.ValidationError({'venue': 'Venue is required to confirm a booking.'})
            if not event_date:
                raise serializers.ValidationError({'event_date': 'Event date is required to confirm a booking.'})
            if not slot:
                raise serializers.ValidationError({'slot': 'Time slot is required to confirm a booking.'})
            event_name = data.get('event_name', getattr(instance, 'event_name', '') if instance else '')
            if not str(event_name or '').strip():
                raise serializers.ValidationError({'event_name': 'Event title is required to confirm a booking.'})

        # Determine start_date and end_date from event_date and slot
        if event_date and slot:
            if slot == 'morning':
                start_dt = datetime.datetime.combine(event_date, datetime.time(12, 0))
                end_dt = datetime.datetime.combine(event_date, datetime.time(16, 0))
                data['custom_start_time'] = None
                data['custom_end_time'] = None
            elif slot == 'evening':
                start_dt = datetime.datetime.combine(event_date, datetime.time(19, 0))
                end_dt = datetime.datetime.combine(event_date, datetime.time(23, 0))
                data['custom_start_time'] = None
                data['custom_end_time'] = None
            else:
                if not custom_start_time or not custom_end_time:
                    if is_draft:
                        start_dt = datetime.datetime.combine(event_date, datetime.time(12, 0))
                        end_dt = datetime.datetime.combine(event_date, datetime.time(16, 0))
                    else:
                        raise serializers.ValidationError({
                            'custom_start_time': 'Start and end times are required for a custom slot.'
                        })
                else:
                    start_dt = datetime.datetime.combine(event_date, custom_start_time)
                    end_dt = datetime.datetime.combine(event_date, custom_end_time)
                    if end_dt <= start_dt:
                        end_dt += timedelta(days=1)

            if settings.USE_TZ:
                current_tz = timezone.get_current_timezone()
                data['start_date'] = timezone.make_aware(start_dt, current_tz)
                data['end_date'] = timezone.make_aware(end_dt, current_tz)
            else:
                data['start_date'] = start_dt
                data['end_date'] = end_dt
        elif is_draft and not event_date:
            # Incomplete draft — keep placeholder window so DB constraints stay valid.
            now = timezone.now()
            data.setdefault('start_date', now)
            data.setdefault('end_date', now + timedelta(hours=1))

        start_date = data.get('start_date')
        end_date = data.get('end_date')

        if not start_date:
            data['start_date'] = timezone.now()
            start_date = data['start_date']
        if not end_date:
            data['end_date'] = start_date + timedelta(days=1)
            end_date = data['end_date']

        if settings.USE_TZ:
            current_tz = timezone.get_current_timezone()
            if start_date and timezone.is_naive(start_date):
                start_date = timezone.make_aware(start_date, current_tz)
                data['start_date'] = start_date
            if end_date and timezone.is_naive(end_date):
                end_date = timezone.make_aware(end_date, current_tz)
                data['end_date'] = end_date

        if start_date >= end_date:
            raise serializers.ValidationError(
                "Start date must be before end date."
            )

        # Remaining seats across selected halls (same slot)
        if not is_draft and ordered_halls and guest_count > combined_capacity:
            names = ' + '.join(hall.name for hall in ordered_halls)
            raise serializers.ValidationError(
                f"Guest count ({guest_count}) exceeds the capacity of '{names}' "
                f"which is {combined_capacity} seats. Please reduce guests or add another hall."
            )

        if not is_draft and ordered_halls and start_date and end_date:
            remaining_total = 0
            for hall in ordered_halls:
                overlapping = Booking.objects.filter(
                    booking_status__in=['PENDING', 'CONFIRMED'],
                ).filter(
                    Q(start_date__lt=end_date, end_date__gt=start_date)
                ).filter(
                    Q(venue=hall) | Q(additional_venues=hall)
                ).distinct()
                if self.instance:
                    overlapping = overlapping.exclude(id=self.instance.id)
                occupied = 0
                for other in overlapping:
                    occupied += (other.gents_count or 0) + (other.ladies_count or 0)
                remaining_total += max(0, int(hall.capacity or 0) - occupied)
            if guest_count > remaining_total:
                names = ' + '.join(hall.name for hall in ordered_halls)
                raise serializers.ValidationError(
                    f"Only {remaining_total} seats left in '{names}' for this time "
                    f"(capacity {combined_capacity}). Reduce guests or choose another hall."
                )

        return data

    def update(self, instance, validated_data):
        if instance.booking_status in ('COMPLETED', 'CANCELLED'):
            raise serializers.ValidationError(
                'Posted or cancelled bookings cannot be modified. Use cancel or a new document.'
            )
        request = self.context.get('request')
        user = request.user if request and hasattr(request, 'user') else None
        if user and user.is_authenticated:
            validated_data['updated_by'] = user
        venue_ids = validated_data.pop('venue_ids', None)
        validated_data.pop('additional_venues', None)
        try:
            booking = super().update(instance, validated_data)
            if venue_ids is not None:
                self._apply_venue_ids(booking, venue_ids)
            return booking
        except ValueError as exc:
            # Accounting posts (unbalanced journal, etc.) → readable 400, not HTML 500.
            raise serializers.ValidationError({'detail': str(exc)}) from exc

    def create(self, validated_data):
        request = self.context.get('request')
        user = request.user if request and hasattr(request, 'user') else None
        if user:
            validated_data['created_by'] = user
            if getattr(user, 'tenant', None):
                validated_data['tenant'] = user.tenant
        if not validated_data.get('tenant'):
            raise serializers.ValidationError(
                {'detail': 'Your account has no hall tenant assigned. Contact admin.'}
            )
        venue_ids = validated_data.pop('venue_ids', None)
        validated_data.pop('additional_venues', None)
        advance = validated_data.get('advance_paid') or 0
        try:
            booking = super().create(validated_data)
            if venue_ids is not None:
                self._apply_venue_ids(booking, venue_ids)
            if advance and float(advance) > 0:
                from finance.models import Payment
                Payment.objects.create(
                    booking=booking,
                    amount=advance,
                    payment_method='CASH',
                    status='COMPLETED',
                    notes='Initial advance at booking',
                    tenant=booking.tenant,
                    recorded_by=user if user and user.is_authenticated else None,
                )
            return booking
        except ValueError as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc
