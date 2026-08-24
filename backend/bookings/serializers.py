from rest_framework import serializers
from .models import Booking
from venues.models import Venue
from django.db.models import Q
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
import datetime

class BookingSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.__str__', read_only=True)
    venue_name = serializers.CharField(source='venue.name', read_only=True)
    venue_capacity = serializers.IntegerField(source='venue.capacity', read_only=True)
    decoration_package_name = serializers.CharField(source='decoration_package.name', read_only=True, allow_null=True)

    class Meta:
        model = Booking
        fields = '__all__'
        read_only_fields = ['tenant', 'created_by', 'remaining_balance', 'payment_status', 'guest_count', 'updated_at']

    def validate(self, data):
        venue = data.get('venue')
        event_date = data.get('event_date')
        slot = data.get('slot', 'morning')
        gents_count = data.get('gents_count', 0)
        ladies_count = data.get('ladies_count', 0)
        guest_count = gents_count + ladies_count

        # Determine start_date and end_date from event_date and slot
        if event_date:
            if slot == 'morning':
                start_dt = datetime.datetime.combine(event_date, datetime.time(12, 0))
                end_dt = datetime.datetime.combine(event_date, datetime.time(16, 0))
            else:
                start_dt = datetime.datetime.combine(event_date, datetime.time(19, 0))
                end_dt = datetime.datetime.combine(event_date, datetime.time(23, 0))
            
            if settings.USE_TZ:
                current_tz = timezone.get_current_timezone()
                data['start_date'] = timezone.make_aware(start_dt, current_tz)
                data['end_date'] = timezone.make_aware(end_dt, current_tz)
            else:
                data['start_date'] = start_dt
                data['end_date'] = end_dt

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

        # ── Capacity Check ──
        if venue and guest_count > venue.capacity:
            raise serializers.ValidationError(
                f"Guest count ({guest_count}) exceeds the capacity of '{venue.name}' "
                f"which is {venue.capacity} seats. Please reduce guests or choose a bigger hall."
            )

        # ── Overlap / Conflict Check ──
        overlapping_bookings = Booking.objects.filter(
            venue=venue,
            booking_status__in=['PENDING', 'CONFIRMED'],
        ).filter(
            Q(start_date__lt=end_date, end_date__gt=start_date)
        )

        if self.instance:
            overlapping_bookings = overlapping_bookings.exclude(id=self.instance.id)

        if overlapping_bookings.exists():
            conflict = overlapping_bookings.first()
            conflict_start = conflict.start_date.strftime('%d %b %Y, %I:%M %p')
            conflict_end = conflict.end_date.strftime('%d %b %Y, %I:%M %p')
            raise serializers.ValidationError(
                f"'{venue.name}' is already booked from {conflict_start} to {conflict_end} "
                f"for '{conflict.event_name}'. Please choose different dates or another hall."
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
        return super().update(instance, validated_data)

    def create(self, validated_data):
        request = self.context.get('request')
        user = request.user if request and hasattr(request, 'user') else None
        if user:
            validated_data['created_by'] = user
            if getattr(user, 'tenant', None):
                validated_data['tenant'] = user.tenant
        advance = validated_data.get('advance_paid') or 0
        booking = super().create(validated_data)
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

