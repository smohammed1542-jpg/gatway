import re

from django.db import transaction
from django.utils import timezone

EVENT_ID_PREFIX = 'Evnt-'
EVENT_ID_PATTERN = re.compile(r'^Evnt-(\d{2})(\d+)$', re.IGNORECASE)


def format_event_booking_id(year, sequence):
    yy = str(int(year))[-2:].zfill(2)
    return f'{EVENT_ID_PREFIX}{yy}{int(sequence):04d}'


def allocate_event_booking_id():
    from .models import Booking

    yy = timezone.localdate().strftime('%y')
    prefix = f'{EVENT_ID_PREFIX}{yy}'
    pattern = re.compile(rf'^{re.escape(prefix)}(\d+)$', re.I)
    with transaction.atomic():
        codes = (
            Booking.objects.select_for_update()
            .filter(booking_id__istartswith=prefix)
            .values_list('booking_id', flat=True)
        )
        highest = 0
        for code in codes:
            match = pattern.match(str(code or ''))
            if match:
                highest = max(highest, int(match.group(1)))
        return format_event_booking_id(yy, highest + 1)
