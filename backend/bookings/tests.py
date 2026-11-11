from decimal import Decimal
from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from authentication.models import User
from bookings.models import Booking
from core.models import Tenant
from customers.models import Customer
from finance.models import Payment
from inventory.models import BookingInventoryItem, InventoryItem
from venues.models import Venue


class BookingTenantAndOverlapTests(TestCase):
    def setUp(self):
        self.tenant_a = Tenant.objects.create(name='Hall A', subdomain='halla')
        self.tenant_b = Tenant.objects.create(name='Hall B', subdomain='hallb')
        self.admin_a = User.objects.create_user(
            username='admin_a',
            email='admin_a@test.com',
            password='pass12345',
            role='ADMIN',
            tenant=self.tenant_a,
        )
        self.admin_b = User.objects.create_user(
            username='admin_b',
            email='admin_b@test.com',
            password='pass12345',
            role='ADMIN',
            tenant=self.tenant_b,
        )
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a, full_name='Client A', phone='03001234567'
        )
        self.venue_a = Venue.objects.create(
            tenant=self.tenant_a, name='Main', location='Floor 1', capacity=500, price_per_day=100000
        )
        self.event_date = date.today() + timedelta(days=30)
        self.booking = Booking.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            venue=self.venue_a,
            event_name='Existing',
            event_date=self.event_date,
            slot='evening',
            gents_count=100,
            ladies_count=100,
            rate_per_head=Decimal('1000'),
            booking_status='CONFIRMED',
        )

    def test_confirmed_unpaid_booking_can_be_deleted(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)

        response = client.delete(f'/api/bookings/{self.booking.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Booking.objects.filter(pk=self.booking.id).exists())

    def test_staff_cannot_delete_booking(self):
        staff = User.objects.create_user(
            username='staff_a',
            email='staff_a@test.com',
            password='pass12345',
            role='STAFF',
            tenant=self.tenant_a,
        )
        client = APIClient()
        client.force_authenticate(user=staff)

        response = client.delete(f'/api/bookings/{self.booking.id}/')

        self.assertEqual(response.status_code, 403)
        self.assertTrue(Booking.objects.filter(pk=self.booking.id).exists())

    def test_pending_booking_can_be_deleted(self):
        booking = Booking.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            venue=self.venue_a,
            event_name='Pending draft',
            booking_status='PENDING',
        )
        client = APIClient()
        client.force_authenticate(user=self.admin_a)

        response = client.delete(f'/api/bookings/{booking.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Booking.objects.filter(pk=booking.id).exists())

    def test_booking_with_payment_cannot_be_deleted(self):
        booking = Booking.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            venue=self.venue_a,
            event_name='Paid pending draft',
            booking_status='PENDING',
        )
        Payment.objects.create(
            tenant=self.tenant_a,
            booking=booking,
            amount=Decimal('100'),
        )
        client = APIClient()
        client.force_authenticate(user=self.admin_a)

        response = client.delete(f'/api/bookings/{booking.id}/')

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Booking.objects.filter(pk=booking.id).exists())

    def test_completed_booking_cannot_be_deleted(self):
        booking = Booking.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            venue=self.venue_a,
            event_name='Completed booking',
            booking_status='COMPLETED',
        )
        client = APIClient()
        client.force_authenticate(user=self.admin_a)

        response = client.delete(f'/api/bookings/{booking.id}/')

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Booking.objects.filter(pk=booking.id).exists())

    def test_deleting_pending_booking_reverses_inventory_allocations(self):
        booking = Booking.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            venue=self.venue_a,
            event_name='Allocated pending draft',
            booking_status='PENDING',
        )
        item = InventoryItem.objects.create(
            tenant=self.tenant_a,
            name='Chair',
            unit='pcs',
            quantity=9,
        )
        BookingInventoryItem.objects.create(
            tenant=self.tenant_a,
            booking=booking,
            inventory_item=item,
            quantity_used=1,
        )
        client = APIClient()
        client.force_authenticate(user=self.admin_a)

        with patch('inventory.services.InventoryService.reverse_booking_allocation') as reverse_allocation:
            response = client.delete(f'/api/bookings/{booking.id}/')

        self.assertEqual(response.status_code, 204)
        reverse_allocation.assert_called_once()

    def test_tenant_user_cannot_see_other_tenant_bookings(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_b)
        response = client.get('/api/bookings/')
        self.assertEqual(response.status_code, 200)
        payload = response.data
        items = payload.get('results', payload) if isinstance(payload, dict) else payload
        self.assertEqual(len(items), 0)

    def test_same_day_second_booking_allowed_when_seats_remain(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        payload = {
            'customer': self.customer_a.id,
            'venue': self.venue_a.id,
            'event_name': 'Second event',
            'event_date': self.event_date.isoformat(),
            'slot': 'evening',
            'gents_count': 50,
            'ladies_count': 50,
            'rate_per_head': '1000',
            'booking_status': 'CONFIRMED',
        }
        response = client.post('/api/bookings/', payload, format='json')
        self.assertEqual(response.status_code, 201)

    def test_same_day_allows_when_seats_exceeded(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        payload = {
            'customer': self.customer_a.id,
            'venue': self.venue_a.id,
            'event_name': 'Over capacity',
            'event_date': self.event_date.isoformat(),
            'slot': 'evening',
            'gents_count': 200,
            'ladies_count': 200,
            'rate_per_head': '1000',
            'booking_status': 'CONFIRMED',
        }
        response = client.post('/api/bookings/', payload, format='json')
        self.assertEqual(response.status_code, 201)

    def test_custom_time_slot_is_saved(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        response = client.post('/api/bookings/', {
            'customer': self.customer_a.id,
            'venue': self.venue_a.id,
            'event_name': 'Custom timing event',
            'event_date': (self.event_date + timedelta(days=1)).isoformat(),
            'slot': 'custom',
            'custom_start_time': '10:30',
            'custom_end_time': '15:45',
            'gents_count': 50,
            'ladies_count': 50,
            'rate_per_head': '1000',
            'booking_status': 'CONFIRMED',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(id=response.data['id'])
        local_start = timezone.localtime(booking.start_date)
        local_end = timezone.localtime(booking.end_date)
        self.assertEqual(local_start.hour, 10)
        self.assertEqual(local_start.minute, 30)
        self.assertEqual(local_end.hour, 15)
        self.assertEqual(local_end.minute, 45)

    def test_empty_custom_times_are_ignored_for_standard_slot(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        response = client.post('/api/bookings/', {
            'customer': self.customer_a.id,
            'venue': self.venue_a.id,
            'event_name': 'Morning event',
            'event_date': (self.event_date + timedelta(days=2)).isoformat(),
            'slot': 'morning',
            'custom_start_time': '',
            'custom_end_time': '',
            'gents_count': 50,
            'ladies_count': 50,
            'rate_per_head': '1000',
            'booking_status': 'CONFIRMED',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(id=response.data['id'])
        self.assertIsNone(booking.custom_start_time)
        self.assertIsNone(booking.custom_end_time)


class MarriageHallReportsTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Hall', subdomain='hallrep')
        self.admin = User.objects.create_user(
            username='rep-admin',
            email='rep@test.com',
            password='pass12345',
            role='ADMIN',
            tenant=self.tenant,
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, full_name='Client', phone='03001234567'
        )
        self.venue = Venue.objects.create(
            tenant=self.tenant, name='Grand', location='L1', capacity=400, price_per_day=80000
        )
        Booking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            venue=self.venue,
            event_name='Wedding',
            event_date=date.today(),
            slot='evening',
            gents_count=100,
            ladies_count=100,
            rate_per_head=Decimal('1000'),
            total_price=Decimal('200000'),
            booking_status='CONFIRMED',
        )

    def test_hall_reports_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        r = client.get('/api/bookings/reports/')
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(r.data['booking_count'], 1)
        self.assertGreater(r.data['total_revenue'], 0)
