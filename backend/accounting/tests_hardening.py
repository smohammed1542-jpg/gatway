"""Hardening regression: AR aging ledger source, DB uniqueness, GH E2E, smoke."""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from decimal import Decimal
from threading import Barrier

from django.db import IntegrityError, connection, connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from accounting import reports
from accounting.chart import BANK, CASH, REVENUE_STAYS
from accounting.models import (
    Account,
    BankTransfer,
    JournalEntry,
    Vendor,
    VendorBill,
    VendorPayment,
)
from accounting.services import AccountingService
from authentication.models import User
from bookings.models import Booking
from core.models import Tenant
from customers.models import Customer
from finance.models import Expense, Payment
from guesthouse.models import GhExpense, Room, StayBooking, StayPayment
from venues.models import Venue


class ARAgingLedgerSourceTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='AR Aging Hall',
            subdomain='araging',
            tax_rate=Decimal('0.00'),
            overtime_rate_per_hour=Decimal('0'),
        )
        self.admin = User.objects.create_user(
            username='ar-admin', email='ar@ex.com', password='pass',
            tenant=self.tenant, role='ADMIN',
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, full_name='AR Client', phone='03001112222'
        )
        self.venue = Venue.objects.create(
            tenant=self.tenant, name='Hall', location='1', capacity=100, price_per_day=1
        )
        AccountingService.ensure_chart(self.tenant)

    def test_ar_aging_from_journals_partial_then_zero(self):
        booking = Booking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            venue=self.venue,
            event_name='Aging Event',
            event_date=date.today() - timedelta(days=10),
            slot='morning',
            gents_count=50,
            ladies_count=50,
            rate_per_head=Decimal('1000'),
            booking_status='CONFIRMED',
            created_by=self.admin,
        )
        # Invoice 100,000 (tax 0)
        self.assertEqual(booking.total_price, Decimal('100000.00'))

        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('40000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        ar = reports.aging_receivable(self.tenant)
        self.assertEqual(ar['total'], Decimal('60000.00'))
        self.assertEqual(
            sum(r['amount'] for r in ar['rows'] if r['booking_id'] == booking.pk),
            Decimal('60000.00'),
        )
        # Operational field may still mirror remaining — aging must not depend on it alone
        booking.refresh_from_db()
        self.assertEqual(booking.remaining_balance, Decimal('60000.00'))

        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('60000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        ar2 = reports.aging_receivable(self.tenant)
        self.assertEqual(ar2['total'], Decimal('0.00'))
        self.assertEqual(ar2['rows'], [])
        for b in ar2['buckets'].values():
            self.assertEqual(b, Decimal('0.00'))
        booking.refresh_from_db()
        self.assertEqual(booking.remaining_balance, Decimal('0'))


class ConcurrentJournalUniquenessTests(TransactionTestCase):
    def tearDown(self):
        connections.close_all()
        super().tearDown()

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Conc Hall',
            subdomain='conchall',
            tax_rate=Decimal('0.00'),
            overtime_rate_per_hour=Decimal('0'),
        )
        self.admin = User.objects.create_user(
            username='conc-admin', email='c@ex.com', password='pass',
            tenant=self.tenant, role='ADMIN',
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, full_name='C', phone='03003334444'
        )
        self.venue = Venue.objects.create(
            tenant=self.tenant, name='H', location='1', capacity=50, price_per_day=1
        )
        AccountingService.ensure_chart(self.tenant)
        self.booking = Booking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            venue=self.venue,
            event_name='Conc',
            event_date=date.today() + timedelta(days=5),
            slot='morning',
            gents_count=25,
            ladies_count=25,
            rate_per_head=Decimal('1000'),
            booking_status='CONFIRMED',
            created_by=self.admin,
        )

    def test_concurrent_payment_post_one_active_journal(self):
        expense = Expense.objects.create(
            tenant=self.tenant, title='Concurrent Exp', category='OTHER',
            amount=Decimal('5000'), expense_date=date.today(), created_by=self.admin,
        )
        entry = JournalEntry.objects.get(source_type='expense', source_id=expense.pk, status='POSTED')
        AccountingService.reverse_entry(entry, user=self.admin, reason='reset for concurrency')

        if connection.vendor == 'sqlite':
            # SQLite serializes writers; uniqueness + idempotent post still verified.
            a = AccountingService.post_expense(expense, user=self.admin)
            b = AccountingService.post_expense(expense, user=self.admin)
            self.assertIsNotNone(a)
            self.assertEqual(a.pk, b.pk)
        else:
            barrier = Barrier(2)
            results = []

            def race():
                connection.close()
                try:
                    barrier.wait(timeout=10)
                    try:
                        results.append(AccountingService.post_expense(expense, user=self.admin))
                    except Exception as exc:  # noqa: BLE001
                        results.append(exc)
                finally:
                    connection.close()

            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(race) for _ in range(2)]
                for f in as_completed(futures):
                    f.result()
            connections.close_all()

            ok = [r for r in results if isinstance(r, JournalEntry)]
            self.assertGreaterEqual(len(ok), 1)

        active = JournalEntry.objects.filter(
            tenant=self.tenant,
            source_type='expense',
            source_id=expense.pk,
            status='POSTED',
            active_source_key__isnull=False,
        )
        self.assertEqual(active.count(), 1)
        self.assertEqual(
            JournalEntry.objects.filter(
                tenant=self.tenant, active_source_key=f'expense:{expense.pk}'
            ).count(),
            1,
        )

    def test_db_rejects_duplicate_active_source_key(self):
        e1 = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_date=date.today(),
            memo='a',
            source_type='payment',
            source_id=999001,
            active_source_key='payment:999001',
            status='POSTED',
        )
        with self.assertRaises(IntegrityError):
            JournalEntry.objects.create(
                tenant=self.tenant,
                entry_date=date.today(),
                memo='b',
                source_type='payment',
                source_id=999001,
                active_source_key='payment:999001',
                status='POSTED',
            )
        # Reversal clears key — correction can reuse
        e1.active_source_key = None
        e1.status = 'REVERSED'
        e1.save(update_fields=['active_source_key', 'status'])
        JournalEntry.objects.create(
            tenant=self.tenant,
            entry_date=date.today(),
            memo='c',
            source_type='payment',
            source_id=999001,
            active_source_key='payment:999001',
            status='POSTED',
        )


class ReceiptUniquenessTests(TransactionTestCase):
    def tearDown(self):
        connections.close_all()
        super().tearDown()

    def setUp(self):
        self.t1 = Tenant.objects.create(
            name='R1', subdomain='rcpt1', tax_rate=Decimal('0'), overtime_rate_per_hour=0
        )
        self.t2 = Tenant.objects.create(
            name='R2', subdomain='rcpt2', tax_rate=Decimal('0'), overtime_rate_per_hour=0
        )
        for t in (self.t1, self.t2):
            AccountingService.ensure_chart(t)
        self.admin1 = User.objects.create_user(
            username='r1a', email='r1@ex.com', password='pass', tenant=self.t1, role='ADMIN'
        )
        self.c1 = Customer.objects.create(tenant=self.t1, full_name='A', phone='1')
        self.c2 = Customer.objects.create(tenant=self.t2, full_name='B', phone='2')
        self.v1 = Venue.objects.create(tenant=self.t1, name='V1', location='1', capacity=10, price_per_day=1)
        self.v2 = Venue.objects.create(tenant=self.t2, name='V2', location='1', capacity=10, price_per_day=1)
        self.b1 = Booking.objects.create(
            tenant=self.t1, customer=self.c1, venue=self.v1, event_name='E1',
            event_date=date.today(), slot='morning', gents_count=1, ladies_count=1,
            rate_per_head=Decimal('1000'), booking_status='CONFIRMED', created_by=self.admin1,
        )
        self.admin2 = User.objects.create_user(
            username='r2a', email='r2@ex.com', password='pass', tenant=self.t2, role='ADMIN'
        )
        self.b2 = Booking.objects.create(
            tenant=self.t2, customer=self.c2, venue=self.v2, event_name='E2',
            event_date=date.today(), slot='morning', gents_count=1, ladies_count=1,
            rate_per_head=Decimal('1000'), booking_status='CONFIRMED', created_by=self.admin2,
        )

    def test_receipt_unique_per_tenant_not_global(self):
        p1 = Payment.objects.create(
            tenant=self.t1, booking=self.b1, amount=Decimal('10'),
            payment_method='CASH', status='COMPLETED', receipt_no='RCP-SHARED-1',
        )
        # Same receipt number allowed on another tenant
        p2 = Payment.objects.create(
            tenant=self.t2, booking=self.b2, amount=Decimal('10'),
            payment_method='CASH', status='COMPLETED', receipt_no='RCP-SHARED-1',
        )
        self.assertEqual(p1.receipt_no, p2.receipt_no)
        with self.assertRaises(IntegrityError):
            Payment.objects.create(
                tenant=self.t1, booking=self.b1, amount=Decimal('5'),
                payment_method='CASH', status='COMPLETED', receipt_no='RCP-SHARED-1',
            )

    def test_auto_receipt_numbers_unique_within_tenant(self):
        receipts = []
        for _ in range(5):
            p = Payment.objects.create(
                tenant=self.t1, booking=self.b1, amount=Decimal('1'),
                payment_method='CASH', status='COMPLETED',
            )
            receipts.append(p.receipt_no)
        self.assertEqual(len(receipts), 5)
        self.assertEqual(len(set(receipts)), 5)
        self.assertTrue(all(r.startswith('RCP-') for r in receipts))

    def test_concurrent_duplicate_receipt_only_one_succeeds(self):
        """Two writers racing the same tenant+receipt_no — DB allows only one."""
        barrier = Barrier(2)
        outcomes = []

        def race():
            connection.close()
            try:
                barrier.wait(timeout=10)
                try:
                    Payment.objects.create(
                        tenant=self.t1, booking=self.b1, amount=Decimal('1'),
                        payment_method='CASH', status='COMPLETED',
                        receipt_no='RCP-RACE-UNIQUE',
                    )
                    outcomes.append('ok')
                except IntegrityError:
                    outcomes.append('dup')
                except Exception as exc:  # noqa: BLE001
                    outcomes.append(type(exc).__name__)
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(race) for _ in range(2)]
            for f in as_completed(futures):
                try:
                    f.result()
                except Exception:  # noqa: BLE001 — sqlite may lock; tolerate
                    outcomes.append('err')
        connections.close_all()

        self.assertEqual(
            Payment.objects.filter(tenant=self.t1, receipt_no='RCP-RACE-UNIQUE').count(),
            1,
        )
        self.assertIn('ok', outcomes)


class GuestHouseAccountingE2ETests(TestCase):
    def setUp(self):
        self.gh = Tenant.objects.create(
            name='GH Tenant',
            subdomain='ghe2e',
            tax_rate=Decimal('0.00'),
            overtime_rate_per_hour=Decimal('0'),
        )
        self.hall = Tenant.objects.create(
            name='Hall Tenant',
            subdomain='halle2e',
            tax_rate=Decimal('0.00'),
            overtime_rate_per_hour=Decimal('0'),
        )
        self.admin = User.objects.create_user(
            username='gh-admin', email='gh@ex.com', password='pass',
            tenant=self.gh, role='ADMIN',
        )
        self.hall_admin = User.objects.create_user(
            username='hall-admin', email='hall@ex.com', password='pass',
            tenant=self.hall, role='ADMIN',
        )
        AccountingService.ensure_chart(self.gh)
        AccountingService.ensure_chart(self.hall)
        self.customer = Customer.objects.create(
            tenant=self.gh, full_name='Guest', phone='03005556666'
        )
        self.hall_customer = Customer.objects.create(
            tenant=self.hall, full_name='Hall Guest', phone='03007778888'
        )
        self.room = Room.objects.create(
            tenant=self.gh,
            room_number='101',
            price_per_night=Decimal('200000'),
            beds=2,
            included_guests=2,
        )
        self.venue = Venue.objects.create(
            tenant=self.hall, name='Main', location='1', capacity=100, price_per_day=1
        )

    def test_guest_house_full_accounting_scenario(self):
        stay = StayBooking.objects.create(
            tenant=self.gh,
            customer=self.customer,
            room=self.room,
            check_in=date.today(),
            check_out=date.today() + timedelta(days=1),
            guests_count=2,
            status='CONFIRMED',
            created_by=self.admin,
        )
        self.assertEqual(stay.total_amount, Decimal('200000.00'))

        StayPayment.objects.create(
            tenant=self.gh, stay=stay, amount=Decimal('80000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        StayPayment.objects.create(
            tenant=self.gh, stay=stay, amount=Decimal('50000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        StayPayment.objects.create(
            tenant=self.gh, stay=stay, amount=Decimal('70000'),
            payment_method='BANK_TRANSFER', status='COMPLETED', recorded_by=self.admin,
        )
        stay.refresh_from_db()
        self.assertEqual(stay.remaining_balance, Decimal('0'))

        GhExpense.objects.create(
            tenant=self.gh, title='Ops', category='OTHER',
            amount=Decimal('30000'), expense_date=date.today(), created_by=self.admin,
        )

        vendor = Vendor.objects.create(tenant=self.gh, name='GH Vendor')
        bill = VendorBill.objects.create(
            tenant=self.gh, vendor=vendor, bill_no='GH-VB-1',
            bill_date=date.today(),
            expense_account=AccountingService.account(self.gh, '5100'),
            amount=Decimal('40000'), status='POSTED', created_by=self.admin,
        )
        AccountingService.post_vendor_bill(bill, user=self.admin)
        AccountingService.post_vendor_payment(
            VendorPayment.objects.create(
                tenant=self.gh, vendor=vendor, bill=bill, payment_no='GH-VP-1',
                payment_date=date.today(), amount=Decimal('25000'),
                payment_method='CASH', status='COMPLETED', created_by=self.admin,
            ),
            user=self.admin,
        )

        cash = AccountingService.account(self.gh, CASH)
        bank = AccountingService.account(self.gh, BANK)
        AccountingService.post_transfer(
            BankTransfer.objects.create(
                tenant=self.gh, transfer_date=date.today(), amount=Decimal('50000'),
                from_account=cash, to_account=bank, status='POSTED', created_by=self.admin,
            ),
            user=self.admin,
        )

        # Hall booking on other tenant must not mix
        Booking.objects.create(
            tenant=self.hall,
            customer=self.hall_customer,
            venue=self.venue,
            event_name='Hall Only',
            event_date=date.today() + timedelta(days=3),
            slot='morning',
            gents_count=50,
            ladies_count=50,
            rate_per_head=Decimal('1000'),
            booking_status='CONFIRMED',
            created_by=self.hall_admin,
        )

        self.assertEqual(
            reports.party_ledger(self.gh, customer_id=self.customer.pk)['closing_balance'],
            Decimal('0.00'),
        )
        self.assertEqual(reports.aging_payable(self.gh)['total'], Decimal('15000.00'))
        self.assertEqual(reports.aging_receivable(self.gh)['total'], Decimal('0.00'))

        pnl = reports.profit_and_loss(self.gh)
        self.assertEqual(pnl['total_revenue'], Decimal('200000.00'))
        self.assertEqual(pnl['total_expenses'], Decimal('70000.00'))
        self.assertEqual(pnl['net_profit'], Decimal('130000.00'))

        tb = reports.trial_balance(self.gh)
        self.assertTrue(tb['balanced'], tb)
        bs = reports.balance_sheet(self.gh)
        self.assertTrue(bs['balanced'], bs)

        self.assertEqual(reports.account_balance(self.gh, CASH), Decimal('25000.00'))
        self.assertEqual(reports.account_balance(self.gh, BANK), Decimal('120000.00'))
        self.assertEqual(reports.account_balance(self.gh, REVENUE_STAYS), Decimal('200000.00'))

        # No duplicate active journals
        for src, sid in [('stay', stay.pk), ('gh_expense', GhExpense.objects.get(tenant=self.gh).pk)] + [
            ('stay_payment', p.pk) for p in StayPayment.objects.filter(stay=stay)
        ]:
            active = JournalEntry.objects.filter(
                tenant=self.gh, source_type=src, source_id=sid, status='POSTED',
                active_source_key__isnull=False,
            )
            self.assertEqual(active.count(), 1, f'{src}:{sid}')

        health = reports.integrity_check(self.gh)
        self.assertTrue(health['ok'], health['issues'])

        # Tenant separation: hall revenue not in GH TB revenue total
        hall_pnl = reports.profit_and_loss(self.hall)
        self.assertEqual(hall_pnl['total_revenue'], Decimal('100000.00'))
        self.assertNotEqual(pnl['total_revenue'], hall_pnl['total_revenue'])
        self.assertFalse(
            JournalEntry.objects.filter(tenant=self.gh, source_type='booking').exists()
        )
        self.assertFalse(
            JournalEntry.objects.filter(tenant=self.hall, source_type='stay').exists()
        )


class AccountingAPISmokeTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Smoke', subdomain='smokeacct', tax_rate=Decimal('0'), overtime_rate_per_hour=0
        )
        self.admin = User.objects.create_user(
            username='smoke-admin', email='sm@ex.com', password='pass',
            tenant=self.tenant, role='ADMIN',
        )
        self.staff = User.objects.create_user(
            username='smoke-staff', email='ss@ex.com', password='pass',
            tenant=self.tenant, role='STAFF',
        )
        AccountingService.ensure_chart(self.tenant)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_report_and_resource_endpoints(self):
        reports_ok = [
            'dashboard', 'profit_and_loss', 'balance_sheet', 'cash_flow',
            'cash_book', 'bank_book', 'customer_ledger', 'vendor_ledger',
            'receivables', 'payables', 'integrity',
        ]
        for name in reports_ok:
            r = self.client.get(f'/api/accounting/reports/{name}/')
            self.assertEqual(r.status_code, 200, f'{name}: {r.status_code} {r.content[:200]}')

        for path in [
            '/api/accounting/accounts/',
            '/api/accounting/journal_entries/',
            '/api/accounting/vendors/',
            '/api/accounting/bank_accounts/',
            '/api/accounting/bank_transfers/',
            '/api/accounting/invoices/',
            '/api/accounting/fiscal_periods/',
            '/api/accounting/cost_centers/',
        ]:
            r = self.client.get(path)
            self.assertEqual(r.status_code, 200, path)

        # Staff cannot open opening balances
        staff_client = APIClient()
        staff_client.force_authenticate(user=self.staff)
        r = staff_client.post('/api/accounting/opening_balances/', {'lines': []}, format='json')
        self.assertIn(r.status_code, (400, 403))


class ERPAlignmentTests(TestCase):
    """Regression tests for ERP alignment (sequences, inventory GL, tenant integrity)."""

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='ERP', subdomain='erpalign', tax_rate=Decimal('0'), overtime_rate_per_hour=0
        )
        self.admin = User.objects.create_user(
            username='erp-admin', email='erp@ex.com', password='pass12345',
            tenant=self.tenant, role='ADMIN',
        )
        AccountingService.ensure_chart(self.tenant)

    def test_document_sequence_increments(self):
        from accounting.sequences import next_document_no
        n1 = next_document_no(self.tenant, 'JE')
        n2 = next_document_no(self.tenant, 'JE')
        self.assertNotEqual(n1, n2)
        self.assertTrue(n1.startswith('JE-'))

    def test_inventory_movement_posts_gl(self):
        from inventory.models import InventoryItem
        from inventory.services import InventoryService

        item = InventoryItem.objects.create(
            tenant=self.tenant, name='Chairs', quantity=0, unit='pcs', price_per_unit=Decimal('100'),
        )
        txn = InventoryService.move(item, 5, txn_type='IN', user=self.admin, tenant=self.tenant)
        entry = JournalEntry.objects.filter(
            tenant=self.tenant, source_type='inventory', source_id=txn.pk, status='POSTED',
        ).first()
        self.assertIsNotNone(entry)
        self.assertTrue(entry.lines.filter(account__code='1200', debit=Decimal('500.00')).exists())

    def test_expense_uses_account_fk_not_description(self):
        from finance.models import Expense
        acct = Account.objects.filter(tenant=self.tenant, code='5020').first()
        exp = Expense.objects.create(
            tenant=self.tenant, title='Power', category='UTILITIES',
            amount=Decimal('50'), expense_date=date.today(),
            account=acct, created_by=self.admin,
        )
        code = AccountingService.resolve_expense_account_code(exp)
        self.assertEqual(code, '5020')

    def test_cost_centers_api(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        r = client.post('/api/accounting/cost_centers/', {
            'code': 'CC01', 'name': 'Hall Ops', 'kind': 'COST',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['code'], 'CC01')
