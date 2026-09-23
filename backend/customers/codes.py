import re

from django.db import transaction


CODE_PREFIX = 'cust-'
CODE_PATTERN = re.compile(r'^cust-(\d+)$', re.IGNORECASE)


def format_customer_code(number):
    return f'{CODE_PREFIX}{int(number):05d}'


def parse_customer_number(value):
    match = CODE_PATTERN.match(str(value or '').strip())
    return int(match.group(1)) if match else 0


def allocate_customer_code(tenant_id):
    from .models import Customer

    if not tenant_id:
        return ''
    with transaction.atomic():
        codes = (
            Customer.objects.select_for_update()
            .filter(tenant_id=tenant_id)
            .exclude(customer_code='')
            .values_list('customer_code', flat=True)
        )
        highest = 0
        for code in codes:
            n = parse_customer_number(code)
            if n > highest:
                highest = n
        return format_customer_code(highest + 1)
