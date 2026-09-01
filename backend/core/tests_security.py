"""Production-readiness security regression tests."""

from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from authentication.models import User
from core.models import Tenant
from customers.models import Customer
from venues.models import Venue
from bookings.models import Booking
from datetime import date, timedelta


class ProductionSecurityTests(TestCase):
    def setUp(self):
        self.t1 = Tenant.objects.create(name='T1', subdomain='sec-t1')
        self.t2 = Tenant.objects.create(name='T2', subdomain='sec-t2')
        self.u1 = User.objects.create_user(
            username='sec-u1', email='u1@ex.com', password='pass12345',
            tenant=self.t1, role='ADMIN', app_type='MARRIAGE_HALL',
        )
        self.u2 = User.objects.create_user(
            username='sec-u2', email='u2@ex.com', password='pass12345',
            tenant=self.t2, role='ADMIN', app_type='MARRIAGE_HALL',
        )
        self.c2 = Customer.objects.create(tenant=self.t2, full_name='Other', phone='03001112222')
        self.v2 = Venue.objects.create(
            tenant=self.t2, name='Hall2', location='x', capacity=10, price_per_day=1
        )
        self.b2 = Booking.objects.create(
            tenant=self.t2, customer=self.c2, venue=self.v2, event_name='Secret',
            event_date=date.today() + timedelta(days=5), slot='morning',
            gents_count=1, ladies_count=1, rate_per_head=Decimal('1000'),
            booking_status='CONFIRMED', created_by=self.u2,
        )
        self.client = APIClient()

    @override_settings(ALLOW_PUBLIC_REGISTRATION=False)
    def test_public_registration_disabled_by_default(self):
        r = self.client.post('/api/auth/register/', {
            'email': 'new@ex.com',
            'password': 'strongpass1',
            'tenant_name': 'Hacker Hall',
        }, format='json')
        self.assertEqual(r.status_code, 403)

    def test_tenant_cannot_read_other_tenant_booking(self):
        self.client.force_authenticate(user=self.u1)
        r = self.client.get(f'/api/bookings/{self.b2.pk}/')
        self.assertIn(r.status_code, (403, 404))

    def test_tenant_cannot_read_other_tenant_customer(self):
        self.client.force_authenticate(user=self.u1)
        r = self.client.get(f'/api/customers/{self.c2.pk}/')
        self.assertIn(r.status_code, (403, 404))

    def test_unauthenticated_accounting_denied(self):
        r = self.client.get('/api/accounting/reports/trial_balance/')
        self.assertIn(r.status_code, (401, 403))
