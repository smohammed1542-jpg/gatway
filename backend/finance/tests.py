from decimal import Decimal
from datetime import date, timedelta

from django.test import TestCase

from authentication.models import User
from bookings.models import Booking
from core.models import Tenant
from customers.models import Customer
from finance.models import Payment
from venues.models import Venue


class AdvancePaidSyncTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Hall', subdomain='sync')
        self.customer = Customer.objects.create(
            tenant=self.tenant, full_name='Pay Client', phone='03001112222'
        )
        self.venue = Venue.objects.create(
            tenant=self.tenant, name='Ballroom', location='1F', capacity=300, price_per_day=50000
        )
        self.booking = Booking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            venue=self.venue,
            event_name='Wedding',
            event_date=date.today() + timedelta(days=14),
            slot='morning',
            gents_count=80,
            ladies_count=80,
            rate_per_head=Decimal('1200'),
            total_price=Decimal('200000'),
            advance_paid=Decimal('0'),
            booking_status='CONFIRMED',
        )

    def test_completed_payments_update_advance_paid(self):
        Payment.objects.create(
            tenant=self.tenant,
            booking=self.booking,
            amount=Decimal('50000'),
            payment_method='CASH',
            status='COMPLETED',
        )
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.advance_paid, Decimal('50000'))

        Payment.objects.create(
            tenant=self.tenant,
            booking=self.booking,
            amount=Decimal('25000'),
            payment_method='BANK',
            status='COMPLETED',
        )
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.advance_paid, Decimal('75000'))

        p = Payment.objects.filter(booking=self.booking).first()
        p.status = 'VOIDED'
        p.save(update_fields=['status'])
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.advance_paid, Decimal('25000'))
