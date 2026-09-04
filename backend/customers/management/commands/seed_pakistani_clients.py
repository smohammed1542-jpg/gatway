"""Seed realistic Pakistani demo clients for Marriage Hall + Guest House."""

from django.core.management.base import BaseCommand
from django.db.models import Q

from authentication.models import User
from core.models import Tenant
from customers.models import Customer

# Marriage Hall clients (event hosts / wedding parties)
HALL_CLIENTS = [
    {
        'full_name': 'Muhammad Usman Khan',
        'first_name': 'Muhammad Usman',
        'last_name': 'Khan',
        'phone': '03001234501',
        'cnic': '35202-1456789-1',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Abdul Sattar Khan',
        'email': 'usman.khan@email.com',
        'address': 'House 14, Block C, Model Town, Lahore',
        'list_status': 'WHITELISTED',
        'notes': 'Regular client — prefers Grand Ballroom evening slot.',
    },
    {
        'full_name': 'Ayesha Siddiqui',
        'first_name': 'Ayesha',
        'last_name': 'Siddiqui',
        'phone': '03011234502',
        'cnic': '35201-9876543-2',
        'gender': 'FEMALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Imran Siddiqui',
        'email': 'ayesha.siddiqui@email.com',
        'address': 'Flat 3B, Gulberg III, Lahore',
        'list_status': 'NORMAL',
        'notes': 'Mehndi + Walima package enquiry.',
    },
    {
        'full_name': 'Bilal Ahmed Qureshi',
        'first_name': 'Bilal Ahmed',
        'last_name': 'Qureshi',
        'phone': '03211234503',
        'cnic': '37405-1122334-5',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Rashid Qureshi',
        'email': 'bilal.qureshi@email.com',
        'address': 'Street 9, F-10/2, Islamabad',
        'list_status': 'NORMAL',
        'notes': 'Corporate dinner booking contact.',
    },
    {
        'full_name': 'Hina Fatima Malik',
        'first_name': 'Hina Fatima',
        'last_name': 'Malik',
        'phone': '03331234504',
        'cnic': '33100-5566778-4',
        'gender': 'FEMALE',
        'relative_relation': 'HUSBAND',
        'relative_name': 'Omar Malik',
        'email': 'hina.malik@email.com',
        'address': 'Canal Road, Johar Town, Lahore',
        'list_status': 'WHITELISTED',
        'notes': 'VIP — family booked twice last year.',
    },
    {
        'full_name': 'Zainab Noor',
        'first_name': 'Zainab',
        'last_name': 'Noor',
        'phone': '03451234505',
        'cnic': '42101-3344556-8',
        'gender': 'FEMALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Noor Ahmed',
        'email': 'zainab.noor@email.com',
        'address': 'DHA Phase 5, Karachi',
        'list_status': 'NORMAL',
        'notes': 'May shift date — keep flexible.',
    },
    {
        'full_name': 'Hassan Raza',
        'first_name': 'Hassan',
        'last_name': 'Raza',
        'phone': '03121234506',
        'cnic': '61101-7788990-1',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Ghulam Raza',
        'email': 'hassan.raza@email.com',
        'address': 'Satellite Town, Rawalpindi',
        'list_status': 'NORMAL',
        'notes': '',
    },
    {
        'full_name': 'Sanaullah Sheikh',
        'first_name': 'Sanaullah',
        'last_name': 'Sheikh',
        'phone': '03081234507',
        'cnic': '35202-2233445-7',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Mian Sheikh',
        'email': 'sanaullah.sheikh@email.com',
        'address': 'Allama Iqbal Town, Lahore',
        'list_status': 'NORMAL',
        'notes': 'Needs generator backup confirmed.',
    },
    {
        'full_name': 'Maryam Javed',
        'first_name': 'Maryam',
        'last_name': 'Javed',
        'phone': '03341234508',
        'cnic': '35202-6677889-0',
        'gender': 'FEMALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Javed Iqbal',
        'email': 'maryam.javed@email.com',
        'address': 'Bahria Town Sector C, Lahore',
        'list_status': 'WHITELISTED',
        'notes': 'Prefers Crystal Garden.',
    },
]

# Guest House primary guests
GH_CLIENTS = [
    {
        'full_name': 'Ali Hassan Bhatti',
        'first_name': 'Ali Hassan',
        'last_name': 'Bhatti',
        'phone': '03005550101',
        'cnic': '35202-1010101-1',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Hassan Bhatti',
        'email': 'ali.bhatti@email.com',
        'address': 'Faisal Town, Lahore',
        'list_status': 'NORMAL',
        'notes': 'Business traveler — prefers Suite.',
    },
    {
        'full_name': 'Saima Nadeem',
        'first_name': 'Saima',
        'last_name': 'Nadeem',
        'phone': '03015550102',
        'cnic': '35201-2020202-2',
        'gender': 'FEMALE',
        'relative_relation': 'HUSBAND',
        'relative_name': 'Nadeem Akhtar',
        'email': 'saima.nadeem@email.com',
        'address': 'Garden Town, Lahore',
        'list_status': 'WHITELISTED',
        'notes': 'Family stay — 2 adults, 1 child.',
    },
    {
        'full_name': 'Farhan Iqbal',
        'first_name': 'Farhan',
        'last_name': 'Iqbal',
        'phone': '03215550103',
        'cnic': '37405-3030303-3',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Iqbal Hussain',
        'email': 'farhan.iqbal@email.com',
        'address': 'G-11/3, Islamabad',
        'list_status': 'NORMAL',
        'notes': 'Check-in usually after Maghrib.',
    },
    {
        'full_name': 'Nida Rizwan',
        'first_name': 'Nida',
        'last_name': 'Rizwan',
        'phone': '03335550104',
        'cnic': '42101-4040404-4',
        'gender': 'FEMALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Rizwan Ahmed',
        'email': 'nida.rizwan@email.com',
        'address': 'Clifton Block 5, Karachi',
        'list_status': 'NORMAL',
        'notes': '',
    },
    {
        'full_name': 'Asad Mehmood',
        'first_name': 'Asad',
        'last_name': 'Mehmood',
        'phone': '03455550105',
        'cnic': '33100-5050505-5',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Mehmood Ali',
        'email': 'asad.mehmood@email.com',
        'address': 'Samanabad, Faisalabad',
        'list_status': 'NORMAL',
        'notes': 'CNIC photocopy kept on file.',
    },
    {
        'full_name': 'Rabia Shahid',
        'first_name': 'Rabia',
        'last_name': 'Shahid',
        'phone': '03125550106',
        'cnic': '35202-6060606-6',
        'gender': 'FEMALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Shahid Anwar',
        'email': 'rabia.shahid@email.com',
        'address': 'Wapda Town, Lahore',
        'list_status': 'WHITELISTED',
        'notes': 'Repeat guest — quiet room preferred.',
    },
    {
        'full_name': 'Kamran Saleem',
        'first_name': 'Kamran',
        'last_name': 'Saleem',
        'phone': '03085550107',
        'cnic': '61101-7070707-7',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Saleem Akbar',
        'email': 'kamran.saleem@email.com',
        'address': 'Cantt, Rawalpindi',
        'list_status': 'NORMAL',
        'notes': '',
    },
    {
        'full_name': 'Mehwish Tariq',
        'first_name': 'Mehwish',
        'last_name': 'Tariq',
        'phone': '03345550108',
        'cnic': '35202-8080808-8',
        'gender': 'FEMALE',
        'relative_relation': 'HUSBAND',
        'relative_name': 'Tariq Jamil',
        'email': 'mehwish.tariq@email.com',
        'address': 'Askari 11, Lahore',
        'list_status': 'NORMAL',
        'notes': 'May add travel companions at check-in.',
    },
    {
        'full_name': 'Imran Shah',
        'first_name': 'Imran',
        'last_name': 'Shah',
        'phone': '03095550109',
        'cnic': '35202-9090909-9',
        'gender': 'MALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Shah Nawaz',
        'email': 'imran.shah@email.com',
        'address': 'Shadman, Lahore',
        'list_status': 'BLOCKLISTED',
        'list_status_note': 'Demo blocklist — unpaid previous stay.',
        'notes': 'Do not book without manager approval.',
    },
    {
        'full_name': 'Amina Khalid',
        'first_name': 'Amina',
        'last_name': 'Khalid',
        'phone': '03115550110',
        'cnic': '35201-1111222-0',
        'gender': 'FEMALE',
        'relative_relation': 'FATHER',
        'relative_name': 'Khalid Mahmood',
        'email': 'amina.khalid@email.com',
        'address': 'Township Sector A1, Lahore',
        'list_status': 'NORMAL',
        'notes': '',
    },
]


def _upsert_client(tenant, data):
    defaults = {
        'full_name': data['full_name'],
        'first_name': data.get('first_name', ''),
        'last_name': data.get('last_name', ''),
        'cnic': data.get('cnic', ''),
        'gender': data.get('gender', ''),
        'relative_relation': data.get('relative_relation', ''),
        'relative_name': data.get('relative_name', ''),
        'email': data.get('email'),
        'address': data.get('address', ''),
        'notes': data.get('notes', ''),
        'list_status': data.get('list_status', 'NORMAL'),
        'list_status_note': data.get('list_status_note', ''),
        'is_minor': False,
        'linked_primary': None,
    }
    customer, created = Customer.objects.update_or_create(
        tenant=tenant,
        phone=data['phone'],
        defaults=defaults,
    )
    return customer, created


def _seed_rows(tenant, rows, label, stdout, style):
    created = updated = 0
    for row in rows:
        _, was_created = _upsert_client(tenant, row)
        if was_created:
            created += 1
        else:
            updated += 1
    stdout.write(style.SUCCESS(
        f'{label} ({tenant.name} / {tenant.subdomain}): '
        f'{len(rows)} clients — created {created}, updated {updated}'
    ))
    return created, updated


def _resolve_hall_tenants():
    ids = set(
        User.objects.filter(app_type='MARRIAGE_HALL', tenant_id__isnull=False)
        .values_list('tenant_id', flat=True)
    )
    qs = Tenant.objects.filter(
        Q(id__in=ids)
        | Q(subdomain__iexact='gateway')
        | Q(name__icontains='marriage')
        | Q(name__icontains='hall')
    ).distinct()
    tenants = list(qs)
    if not tenants:
        hall, _ = Tenant.objects.get_or_create(
            subdomain='gateway',
            defaults={'name': 'Gateway Marriage Hall', 'plan_type': 'PREMIUM'},
        )
        tenants = [hall]
    return tenants


def _resolve_gh_tenants():
    ids = set(
        User.objects.filter(app_type='GUEST_HOUSE', tenant_id__isnull=False)
        .values_list('tenant_id', flat=True)
    )
    qs = Tenant.objects.filter(
        Q(id__in=ids)
        | Q(subdomain__iexact='gateway-guesthouse')
        | Q(name__icontains='guest')
    ).distinct()
    tenants = list(qs)
    if not tenants:
        gh, _ = Tenant.objects.get_or_create(
            subdomain='gateway-guesthouse',
            defaults={'name': 'Gateway Guest House', 'plan_type': 'STANDARD'},
        )
        tenants = [gh]
    return tenants


class Command(BaseCommand):
    help = 'Seed Pakistani dummy clients into live Marriage Hall and Guest House tenants'

    def add_arguments(self, parser):
        parser.add_argument('--hall-only', action='store_true')
        parser.add_argument('--gh-only', action='store_true')

    def handle(self, *args, **options):
        do_hall = not options['gh_only']
        do_gh = not options['hall_only']
        created_total = updated_total = 0

        if do_hall:
            for tenant in _resolve_hall_tenants():
                c, u = _seed_rows(
                    tenant, HALL_CLIENTS, 'Marriage Hall', self.stdout, self.style
                )
                created_total += c
                updated_total += u

        if do_gh:
            for tenant in _resolve_gh_tenants():
                c, u = _seed_rows(
                    tenant, GH_CLIENTS, 'Guest House', self.stdout, self.style
                )
                created_total += c
                updated_total += u

        self.stdout.write(self.style.SUCCESS(
            f'Done. Created {created_total}, updated {updated_total}.'
        ))
