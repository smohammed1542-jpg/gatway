from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from authentication.models import User
from core.models import Tenant, UserSettings
from customers.models import Customer
from guesthouse.models import Room, StayBooking, StayPayment
from guesthouse.page_visibility import ensure_tenant_gh_pages
from guesthouse.services_catalog import ensure_tenant_gh_services


class Command(BaseCommand):
    help = 'Seed demo Guest House tenant with rooms, guests, and sample stays'

    def handle(self, *args, **options):
        tenant, _ = Tenant.objects.get_or_create(
            subdomain='gateway-guesthouse',
            defaults={'name': 'Gateway Guest House', 'plan_type': 'STANDARD'},
        )
        ensure_tenant_gh_pages(tenant)
        ensure_tenant_gh_services(tenant)

        admin, created = User.objects.get_or_create(
            username='gh_admin',
            defaults={
                'email': 'gh_admin@gateway.com',
                'role': 'ADMIN',
                'tenant': tenant,
                'app_type': 'GUEST_HOUSE',
                'first_name': 'Guest',
                'last_name': 'Admin',
            },
        )
        admin.tenant = tenant
        admin.role = 'ADMIN'
        admin.app_type = 'GUEST_HOUSE'
        admin.set_password('gh_admin123')
        admin.is_staff = True
        admin.save()
        UserSettings.objects.get_or_create(user=admin)

        staff, _ = User.objects.get_or_create(
            username='gh_staff',
            defaults={
                'email': 'gh_staff@gateway.com',
                'role': 'STAFF',
                'tenant': tenant,
                'app_type': 'GUEST_HOUSE',
                'first_name': 'Front',
                'last_name': 'Desk',
            },
        )
        staff.tenant = tenant
        staff.role = 'STAFF'
        staff.app_type = 'GUEST_HOUSE'
        staff.set_password('gh_staff123')
        staff.save()
        UserSettings.objects.get_or_create(user=staff)

        rooms_data = [
            {'room_number': '101', 'room_type': 'DOUBLE', 'beds': 2, 'price_per_night': Decimal('3500')},
            {'room_number': '102', 'room_type': 'SINGLE', 'beds': 1, 'price_per_night': Decimal('2500')},
            {'room_number': '201', 'room_type': 'SUITE', 'beds': 2, 'price_per_night': Decimal('5500')},
            {'room_number': '202', 'room_type': 'FAMILY', 'beds': 4, 'price_per_night': Decimal('6500')},
        ]
        rooms = []
        for data in rooms_data:
            room, _ = Room.objects.update_or_create(
                tenant=tenant,
                room_number=data['room_number'],
                defaults={
                    **data,
                    'included_guests': data['beds'],
                    'extra_guest_fee_per_night': Decimal('500'),
                    'description': f"Demo {data['room_type'].lower()} room",
                    'status': 'ACTIVE',
                },
            )
            rooms.append(room)

        guests_data = [
            {'full_name': 'Ali Hassan Bhatti', 'phone': '03005550101', 'cnic': '35202-1010101-1'},
            {'full_name': 'Saima Nadeem', 'phone': '03015550102', 'cnic': '35201-2020202-2'},
            {'full_name': 'Farhan Iqbal', 'phone': '03215550103', 'cnic': '37405-3030303-3'},
            {'full_name': 'Ahmed Khan', 'phone': '03001112233', 'cnic': '35202-1234567-1'},
            {'full_name': 'Fatima Ali', 'phone': '03004445566', 'cnic': '35202-7654321-9'},
        ]
        guests = []
        for g in guests_data:
            customer, _ = Customer.objects.get_or_create(
                tenant=tenant,
                phone=g['phone'],
                defaults={'full_name': g['full_name'], 'cnic': g['cnic']},
            )
            guests.append(customer)

        today = timezone.localdate()
        stays_created = 0
        samples = [
            (guests[0], rooms[0], today + timedelta(days=1), today + timedelta(days=3), 'CONFIRMED', Decimal('2000')),
            (guests[1], rooms[2], today - timedelta(days=1), today + timedelta(days=2), 'CHECKED_IN', Decimal('3000')),
        ]
        for customer, room, check_in, check_out, status, advance in samples:
            if StayBooking.objects.filter(
                tenant=tenant,
                room=room,
                check_in=check_in,
                check_out=check_out,
            ).exists():
                continue
            stay = StayBooking.objects.create(
                tenant=tenant,
                customer=customer,
                room=room,
                check_in=check_in,
                check_out=check_out,
                guests_count=2,
                status=status,
                created_by=admin,
            )
            if advance > 0:
                StayPayment.objects.create(
                    tenant=tenant,
                    stay=stay,
                    amount=advance,
                    payment_method='CASH',
                    status='COMPLETED',
                    notes='Initial advance on booking',
                    recorded_by=admin,
                )
            stays_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Guest House seed complete for {tenant.name}: '
            f'{len(rooms)} rooms, {len(guests)} guests, {stays_created} new stays. '
            f'Login: gh_admin / gh_admin123 or gh_staff / gh_staff123'
        ))
