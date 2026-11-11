from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from authentication.models import User
from bookings.models import Booking
from core.models import NotificationLog, Tenant, UserSettings
from core.notifications.service import dispatch_customer_notification
from customers.models import Customer
from finance.models import Expense, Payment
from inventory.models import InventoryItem
from venues.models import Venue


class NotificationSkipTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Notify Hall', subdomain='notify')

    def test_skips_when_customer_has_no_phone(self):
        from customers.models import Customer

        customer = Customer.objects.create(
            tenant=self.tenant, full_name='No Phone', phone=''
        )
        logs = dispatch_customer_notification(
            tenant=self.tenant,
            customer=customer,
            channels=['SMS'],
            message='Test',
        )
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].status, 'SKIPPED')
        self.assertEqual(NotificationLog.objects.count(), 1)


class TenantBusinessDataResetTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Reset Hall', subdomain='reset-hall')
        self.other_tenant = Tenant.objects.create(name='Keep Hall', subdomain='keep-hall')
        self.admin = User.objects.create_user(
            username='reset-admin',
            email='reset-admin@test.com',
            password='pass12345',
            role='ADMIN',
            tenant=self.tenant,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        UserSettings.objects.create(user=self.admin, theme='dark')

        self.customer = Customer.objects.create(
            tenant=self.tenant, full_name='Reset Customer', phone='03001234567'
        )
        self.venue = Venue.objects.create(
            tenant=self.tenant,
            name='Reset Hall Venue',
            location='Main floor',
            capacity=300,
            price_per_day=100000,
        )
        self.booking = Booking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            venue=self.venue,
            event_name='Reset Event',
            booking_status='PENDING',
        )
        self.payment = Payment.objects.create(
            tenant=self.tenant,
            booking=self.booking,
            amount='2500.00',
        )
        self.expense = Expense.objects.create(
            tenant=self.tenant,
            title='Reset expense',
            amount='500.00',
            expense_date=date.today(),
        )
        self.inventory_item = InventoryItem.objects.create(
            tenant=self.tenant,
            name='Reset Chair',
            unit='pcs',
            quantity=20,
        )

        other_customer = Customer.objects.create(
            tenant=self.other_tenant, full_name='Keep Customer', phone='03007654321'
        )
        other_venue = Venue.objects.create(
            tenant=self.other_tenant,
            name='Keep Venue',
            location='Upper floor',
            capacity=200,
            price_per_day=50000,
        )
        self.other_booking = Booking.objects.create(
            tenant=self.other_tenant,
            customer=other_customer,
            venue=other_venue,
            event_name='Keep Event',
            booking_status='PENDING',
        )

    def test_reset_requires_exact_tenant_confirmation(self):
        response = self.client.delete(
            '/api/dashboard/tenant-data/',
            {'confirmation': 'DELETE OTHER'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Booking.objects.filter(pk=self.booking.pk).exists())

    def test_staff_cannot_reset_tenant_data(self):
        staff = User.objects.create_user(
            username='reset-staff',
            email='reset-staff@test.com',
            password='pass12345',
            role='STAFF',
            tenant=self.tenant,
        )
        self.client.force_authenticate(user=staff)

        response = self.client.delete(
            '/api/dashboard/tenant-data/',
            {'confirmation': 'DELETE'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(Booking.objects.filter(pk=self.booking.pk).exists())

    def test_reset_deletes_only_current_tenant_business_data(self):
        response = self.client.delete(
            '/api/dashboard/tenant-data/',
            {'confirmation': 'DELETE'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Booking.objects.filter(tenant=self.tenant).exists())
        self.assertFalse(Customer.objects.filter(tenant=self.tenant).exists())
        self.assertFalse(Venue.objects.filter(tenant=self.tenant).exists())
        self.assertFalse(InventoryItem.objects.filter(tenant=self.tenant).exists())
        self.assertFalse(Payment.objects.filter(pk=self.payment.pk).exists())
        self.assertFalse(Expense.objects.filter(pk=self.expense.pk).exists())
        self.assertTrue(Booking.objects.filter(pk=self.other_booking.pk).exists())
        self.assertTrue(Tenant.objects.filter(pk=self.tenant.pk).exists())
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())
        self.assertEqual(UserSettings.objects.get(user=self.admin).theme, 'dark')
