from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from authentication.models import User
from core.models import Tenant
from customers.models import Customer
from guesthouse.models import Room, StayBooking, StayPayment


class GuestHouseStayTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='GH Test', subdomain='gh-test')
        self.admin = User.objects.create_user(
            username='gh_admin_test',
            email='gh@test.com',
            password='pass12345',
            role='ADMIN',
            tenant=self.tenant,
            app_type='GUEST_HOUSE',
        )
        self.staff = User.objects.create_user(
            username='gh_staff_test',
            email='staff@test.com',
            password='pass12345',
            role='STAFF',
            tenant=self.tenant,
            app_type='GUEST_HOUSE',
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            full_name='Test Guest',
            phone='03009998877',
            cnic='35202-1111111-1',
        )
        self.room = Room.objects.create(
            tenant=self.tenant,
            room_number='T1',
            room_type='DOUBLE',
            beds=2,
            included_guests=2,
            extra_bed_allowed=True,
            extra_bed_limit=1,
            extra_guest_fee_per_night=Decimal('500'),
            price_per_night=Decimal('3000'),
            status='ACTIVE',
        )
        self.check_in = date.today() + timedelta(days=10)
        self.check_out = self.check_in + timedelta(days=2)

    def _stay_payload(self, room=None, check_in=None, check_out=None):
        return {
            'customer': self.customer.id,
            'room': (room or self.room).id,
            'check_in': str(check_in or self.check_in),
            'check_out': str(check_out or self.check_out),
            'guests_count': 2,
            'status': 'CONFIRMED',
            'advance_paid': '0',
        }

    def test_staff_can_create_stay(self):
        client = APIClient()
        client.force_authenticate(user=self.staff)
        response = client.post('/api/guesthouse/stays/', self._stay_payload(), format='json')
        self.assertEqual(response.status_code, 201)

    def test_stay_total_charges_extra_guest_fee_beyond_included(self):
        client = APIClient()
        client.force_authenticate(user=self.staff)
        check_in = self.check_in + timedelta(days=50)
        check_out = check_in + timedelta(days=2)
        response = client.post('/api/guesthouse/stays/', {
            **self._stay_payload(check_in=check_in, check_out=check_out),
            'guests_count': 3,
            'guest_roster': [
                {
                    'customer': self.customer.id,
                    'full_name': self.customer.full_name,
                    'cnic': self.customer.cnic,
                    'phone': self.customer.phone,
                    'is_primary': True,
                },
                {
                    'full_name': 'Guest Two',
                    'cnic': '35202-2222222-2',
                    'phone': '03001112222',
                    'is_primary': False,
                },
                {
                    'full_name': 'Guest Three',
                    'cnic': '35202-3333333-3',
                    'phone': '03003334444',
                    'is_primary': False,
                },
            ],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        # 2 nights × 3000 base + 1 extra guest × 500/night × 2 nights = 7000
        expected_room = Decimal('7000')
        self.assertEqual(Decimal(str(response.data['total_amount'])), expected_room)

        client = APIClient()
        client.force_authenticate(user=self.staff)
        response = client.post('/api/guesthouse/stays/', self._stay_payload(), format='json')
        self.assertEqual(response.status_code, 201)

    def test_staff_can_create_stay_with_guest_roster(self):
        client = APIClient()
        client.force_authenticate(user=self.staff)
        check_in = self.check_in + timedelta(days=30)
        check_out = check_in + timedelta(days=2)
        response = client.post('/api/guesthouse/stays/', {
            **self._stay_payload(check_in=check_in, check_out=check_out),
            'guests_count': 1,
            'guest_roster': [{
                'customer': self.customer.id,
                'full_name': self.customer.full_name,
                'cnic': self.customer.cnic,
                'phone': self.customer.phone,
                'is_primary': True,
            }],
        }, format='json')
        self.assertEqual(response.status_code, 201)

    def test_empty_companion_rows_ignored_when_guests_count_one(self):
        client = APIClient()
        client.force_authenticate(user=self.staff)
        check_in = self.check_in + timedelta(days=40)
        check_out = check_in + timedelta(days=2)
        response = client.post('/api/guesthouse/stays/', {
            **self._stay_payload(check_in=check_in, check_out=check_out),
            'guests_count': 1,
            'guest_roster': [
                {
                    'customer': self.customer.id,
                    'full_name': self.customer.full_name,
                    'cnic': self.customer.cnic,
                    'phone': self.customer.phone,
                    'is_primary': True,
                },
                {
                    'customer': None,
                    'full_name': '',
                    'cnic': '',
                    'phone': '',
                    'is_primary': False,
                },
            ],
        }, format='json')
        self.assertEqual(response.status_code, 201)

        client = APIClient()
        client.force_authenticate(user=self.staff)
        response = client.post('/api/guesthouse/stays/', self._stay_payload(), format='json')
        self.assertEqual(response.status_code, 201)

    def test_overlapping_stay_rejected(self):
        StayBooking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            room=self.room,
            check_in=self.check_in,
            check_out=self.check_out,
            guests_count=2,
            status='CONFIRMED',
        )
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.post('/api/guesthouse/stays/', self._stay_payload(), format='json')
        self.assertEqual(response.status_code, 400)

    def test_payment_syncs_advance_paid(self):
        stay = StayBooking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            room=self.room,
            check_in=self.check_in,
            check_out=self.check_out,
            guests_count=2,
            status='CONFIRMED',
        )
        StayPayment.objects.create(
            tenant=self.tenant,
            stay=stay,
            amount=Decimal('1500'),
            payment_method='CASH',
            status='COMPLETED',
            recorded_by=self.admin,
        )
        stay.refresh_from_db()
        self.assertEqual(stay.advance_paid, Decimal('1500'))

    def test_staff_can_record_payment(self):
        stay = StayBooking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            room=self.room,
            check_in=self.check_in,
            check_out=self.check_out,
            guests_count=2,
            status='CONFIRMED',
        )
        client = APIClient()
        client.force_authenticate(user=self.staff)
        response = client.post('/api/guesthouse/payments/', {
            'stay': stay.id,
            'amount': '1000',
            'payment_method': 'CASH',
            'status': 'COMPLETED',
        }, format='json')
        self.assertEqual(response.status_code, 201)

    def test_staff_can_create_customer(self):
        client = APIClient()
        client.force_authenticate(user=self.staff)
        response = client.post('/api/customers/', {
            'full_name': 'Walk-in Guest',
            'phone': '03001112233',
            'cnic': '35202-2222222-2',
        }, format='json')
        self.assertEqual(response.status_code, 201)

    def test_staff_cannot_delete_customer(self):
        client = APIClient()
        client.force_authenticate(user=self.staff)
        response = client.delete(f'/api/customers/{self.customer.id}/')
        self.assertEqual(response.status_code, 403)

    def test_staff_cannot_delete_stay(self):
        stay = StayBooking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            room=self.room,
            check_in=self.check_in,
            check_out=self.check_out,
            guests_count=2,
            status='CONFIRMED',
        )
        client = APIClient()
        client.force_authenticate(user=self.staff)
        response = client.delete(f'/api/guesthouse/stays/{stay.id}/')
        self.assertEqual(response.status_code, 403)

    def test_blocklisted_customer_cannot_be_booked(self):
        self.customer.list_status = 'BLOCKLISTED'
        self.customer.save(update_fields=['list_status'])
        client = APIClient()
        client.force_authenticate(user=self.staff)
        response = client.post('/api/guesthouse/stays/', self._stay_payload(), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('customer', response.data)

    def test_customer_list_status_can_be_updated(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.post(f'/api/customers/{self.customer.id}/set-list-status/', {
            'list_status': 'WHITELISTED',
            'list_status_note': 'Always verify ID quickly.',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.list_status, 'WHITELISTED')
