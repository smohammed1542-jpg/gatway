from decimal import Decimal

DEFAULT_TAX_RATE = Decimal('0.05')
DEFAULT_OVERTIME_RATE = Decimal('5000.00')


def tenant_tax_rate(tenant):
    if tenant is not None and getattr(tenant, 'tax_rate', None) is not None:
        return Decimal(str(tenant.tax_rate))
    return DEFAULT_TAX_RATE


def tenant_overtime_rate(tenant):
    if tenant is not None and getattr(tenant, 'overtime_rate_per_hour', None) is not None:
        return Decimal(str(tenant.overtime_rate_per_hour))
    return DEFAULT_OVERTIME_RATE


def compute_booking_totals(booking, tax_rate=None, overtime_rate=None):
    """Pure pricing rules for a hall booking. Does not persist."""
    tenant = getattr(booking, 'tenant', None)
    tax_rate = Decimal(str(tax_rate if tax_rate is not None else tenant_tax_rate(tenant)))
    overtime_rate = Decimal(
        str(overtime_rate if overtime_rate is not None else tenant_overtime_rate(tenant))
    )

    guest_count = int(booking.gents_count or 0) + int(booking.ladies_count or 0)
    subtotal = Decimal(str(guest_count)) * Decimal(str(booking.rate_per_head or 0))

    decoration_charge = Decimal(str(booking.decoration_charge or 0))
    if getattr(booking, 'decoration_package_id', None) and decoration_charge <= 0:
        package = getattr(booking, 'decoration_package', None)
        if package is not None:
            decoration_charge = Decimal(str(package.base_price or 0))

    extra_services = (
        Decimal(str(booking.overtime_hours or 0)) * overtime_rate
        + Decimal(str(booking.kitchen_charge or 0))
        + decoration_charge
        + Decimal(str(booking.generator_charge or 0))
    )
    total_before_tax = subtotal + extra_services
    tax_amount = (total_before_tax * tax_rate).quantize(Decimal('0.01'))
    total_price = total_before_tax + tax_amount

    advance = Decimal(str(booking.advance_paid or 0))
    if booking.booking_status == 'CANCELLED':
        remaining = Decimal('0')
    else:
        remaining = total_price - advance

    if advance <= 0:
        payment_status = 'UNPAID'
    elif remaining <= 0:
        payment_status = 'PAID'
    else:
        payment_status = 'PARTIAL'

    return {
        'guest_count': guest_count,
        'subtotal': subtotal,
        'extra_services': extra_services,
        'decoration_charge': decoration_charge,
        'tax_rate': tax_rate,
        'tax_amount': tax_amount,
        'total_before_tax': total_before_tax,
        'total_price': total_price,
        'remaining_balance': remaining,
        'payment_status': payment_status,
        'overtime_rate': overtime_rate,
    }


def apply_booking_totals(booking):
    totals = compute_booking_totals(booking)
    booking.guest_count = totals['guest_count']
    booking.decoration_charge = totals['decoration_charge']
    booking.total_price = totals['total_price']
    booking.remaining_balance = totals['remaining_balance']
    booking.payment_status = totals['payment_status']
    return totals
