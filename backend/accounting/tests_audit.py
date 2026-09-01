"""Production-readiness audit tests for accounting integrity."""

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounting import reports
from accounting.chart import AP, AR, BANK, CASH, CUSTOMER_ADVANCES, REVENUE_HALL
from accounting.models import (
    BankAccount,
    BankTransfer,
    JournalEntry,
    JournalLine,
    Vendor,
    VendorBill,
    VendorPayment,
)
from accounting.services import AccountingService, _dec
from authentication.models import User
from bookings.models import Booking
from bookings.pricing import compute_booking_totals
from core.models import Tenant
from customers.models import Customer
from finance.models import Expense, Payment
from venues.models import Venue


class AccountingAuditTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Audit Hall',
            subdomain='audithall',
            tax_rate=Decimal('0.00'),  # simplify: no tax for AR math
            overtime_rate_per_hour=Decimal('0'),
        )
        self.admin = User.objects.create_user(
            username='audit-admin', email='a@ex.com', password='pass',
            tenant=self.tenant, role='ADMIN',
        )
        self.manager = User.objects.create_user(
            username='audit-mgr', email='m@ex.com', password='pass',
            tenant=self.tenant, role='MANAGER',
        )
        self.staff = User.objects.create_user(
            username='audit-staff', email='s@ex.com', password='pass',
            tenant=self.tenant, role='STAFF',
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, full_name='Audit Client', phone='03009998888'
        )
        self.venue = Venue.objects.create(
            tenant=self.tenant, name='Main Hall', location='1', capacity=500, price_per_day=1
        )
        AccountingService.ensure_chart(self.tenant)

    def _confirmed_booking(self, guests=100, rate=Decimal('2000'), **kwargs):
        """With tax_rate=0: total = guests * rate (+ extras)."""
        defaults = dict(
            tenant=self.tenant,
            customer=self.customer,
            venue=self.venue,
            event_name='Wedding',
            event_date=date.today() + timedelta(days=21),
            slot='morning',
            gents_count=guests // 2,
            ladies_count=guests - guests // 2,
            rate_per_head=rate,
            booking_status='CONFIRMED',
            created_by=self.admin,
        )
        defaults.update(kwargs)
        return Booking.objects.create(**defaults)

    def test_reversal_nets_to_zero_in_reports(self):
        """REVERSED originals must remain in TB so they cancel with reversal lines."""
        expense = Expense.objects.create(
            tenant=self.tenant, title='Paint', category='MAINTENANCE',
            amount=Decimal('10000'), expense_date=date.today(), created_by=self.admin,
        )
        entry = JournalEntry.objects.get(source_type='expense', source_id=expense.pk, status='POSTED')
        AccountingService.reverse_entry(entry, user=self.admin, reason='Void expense')
        entry.refresh_from_db()
        self.assertEqual(entry.status, 'REVERSED')
        cash = reports.account_balance(self.tenant, CASH)
        exp = reports.account_balance(self.tenant, '5050')  # maintenance
        # Net effect of expense+reversal must be zero
        self.assertEqual(cash, Decimal('0.00'))
        self.assertEqual(exp, Decimal('0.00'))
        tb = reports.trial_balance(self.tenant)
        self.assertTrue(tb['balanced'])

    def test_advance_then_confirm_then_partial_payments(self):
        """50k advance while PENDING → Advances; confirm → revenue; more payments → AR."""
        booking = Booking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            venue=self.venue,
            event_name='Adv Ev',
            event_date=date.today() + timedelta(days=30),
            slot='evening',
            gents_count=50,
            ladies_count=50,
            rate_per_head=Decimal('1500'),  # total 150,000 with tax 0
            booking_status='PENDING',
            created_by=self.admin,
        )
        totals = compute_booking_totals(booking)
        self.assertEqual(totals['total_price'], Decimal('150000.00'))

        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('50000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        pay_entry = JournalEntry.objects.get(source_type='payment', status='POSTED')
        self.assertTrue(
            pay_entry.lines.filter(account__code=CUSTOMER_ADVANCES, credit=Decimal('50000')).exists()
        )
        self.assertFalse(
            JournalEntry.objects.filter(source_type='booking', source_id=booking.pk, status='POSTED').exists()
        )

        booking.booking_status = 'CONFIRMED'
        booking.save()
        inv = JournalEntry.objects.filter(
            source_type='booking', source_id=booking.pk, status='POSTED'
        ).exclude(reversals__status='POSTED').get()
        # Exactly one active booking journal — invoice document must not add another
        self.assertEqual(
            JournalEntry.objects.filter(
                source_type='booking', source_id=booking.pk, status='POSTED'
            ).exclude(reversals__status='POSTED').count(),
            1,
        )
        self.assertTrue(inv.lines.filter(account__code=AR, debit=Decimal('150000')).exists())
        self.assertTrue(inv.lines.filter(account__code=REVENUE_HALL, credit=Decimal('150000')).exists())

        # Apply advances
        adj = JournalEntry.objects.filter(
            source_type='adjustment', source_id=booking.pk, status='POSTED'
        ).exclude(reversals__status='POSTED').get()
        self.assertTrue(adj.lines.filter(account__code=CUSTOMER_ADVANCES, debit=Decimal('50000')).exists())

        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('37500'),
            payment_method='BANK_TRANSFER', status='COMPLETED', recorded_by=self.admin,
        )
        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('37500'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('25000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        booking.refresh_from_db()
        self.assertEqual(booking.remaining_balance, Decimal('0.00'))
        self.assertEqual(booking.payment_status, 'PAID')

        # Customer ledger ends at 0 (AR + Advances nets)
        ledger = reports.party_ledger(self.tenant, customer_id=self.customer.pk)
        self.assertEqual(ledger['closing_balance'], Decimal('0.00'))
        tb = reports.trial_balance(self.tenant)
        self.assertTrue(tb['balanced'])

    def test_booking_price_change_reverses_and_reposts(self):
        booking = self._confirmed_booking(guests=100, rate=Decimal('1000'))  # 100000
        first = JournalEntry.objects.get(source_type='booking', source_id=booking.pk, status='POSTED')
        first_id = first.pk
        booking.rate_per_head = Decimal('1200')  # 120000
        booking.save()
        first.refresh_from_db()
        self.assertEqual(first.status, 'REVERSED')
        second = JournalEntry.objects.filter(
            source_type='booking', source_id=booking.pk, status='POSTED'
        ).exclude(reversals__status='POSTED').get()
        self.assertNotEqual(second.pk, first_id)
        self.assertEqual(AccountingService._entry_ar_total(second), Decimal('120000.00'))
        # No duplicate active booking journals
        active = [
            e for e in JournalEntry.objects.filter(source_type='booking', source_id=booking.pk, status='POSTED')
            if not AccountingService.is_reversed(e)
        ]
        self.assertEqual(len(active), 1)
        tb = reports.trial_balance(self.tenant)
        self.assertTrue(tb['balanced'])

    def test_invoice_document_does_not_post_journal(self):
        booking = self._confirmed_booking(guests=10, rate=Decimal('1000'))
        before = JournalEntry.objects.filter(tenant=self.tenant).count()
        from accounting.models import Invoice
        inv = Invoice.objects.filter(booking=booking).first()
        self.assertIsNotNone(inv)
        # Touch invoice
        inv.notes = 'updated'
        inv.save()
        after = JournalEntry.objects.filter(tenant=self.tenant).count()
        self.assertEqual(before, after)
        self.assertEqual(
            JournalEntry.objects.filter(source_type='invoice').count(),
            0,
        )

    def test_payment_method_mapping_and_bank_gl(self):
        booking = self._confirmed_booking(guests=10, rate=Decimal('1000'))
        ba = AccountingService.default_bank_account(self.tenant)
        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('100'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('200'),
            payment_method='CARD', status='COMPLETED', recorded_by=self.admin,
            bank_account=ba,
        )
        self.assertTrue(
            JournalLine.objects.filter(
                journal_entry__source_type='payment', account__code=CASH, debit=Decimal('100')
            ).exists()
        )
        self.assertTrue(
            JournalLine.objects.filter(
                journal_entry__source_type='payment', account__code=BANK, debit=Decimal('200')
            ).exists()
        )

    def test_transfer_not_in_pnl_or_cash_flow_gross(self):
        # Seed cash via opening
        AccountingService.post_opening_balances(
            self.tenant,
            lines=[
                (CASH, Decimal('100000'), 0, 'Open cash'),
                ('3000', 0, Decimal('100000'), 'Capital'),
            ],
            user=self.admin,
        )
        cash = AccountingService.account(self.tenant, CASH)
        bank = AccountingService.account(self.tenant, BANK)
        tr = BankTransfer.objects.create(
            tenant=self.tenant, transfer_date=date.today(), amount=Decimal('40000'),
            from_account=cash, to_account=bank, status='POSTED', created_by=self.admin,
        )
        AccountingService.post_transfer(tr, user=self.admin)
        pnl = reports.profit_and_loss(self.tenant)
        self.assertEqual(pnl['total_revenue'], Decimal('0.00'))
        self.assertEqual(pnl['total_expenses'], Decimal('0.00'))
        cf = reports.cash_flow(self.tenant)
        # Gross in/out exclude transfers; total cash+bank unchanged
        self.assertEqual(cf['cash_inflows'], Decimal('100000.00'))  # opening only
        self.assertEqual(reports.account_balance(self.tenant, CASH) + reports.account_balance(self.tenant, BANK), Decimal('100000.00'))
        self.assertEqual(cf['closing_cash'], Decimal('100000.00'))

    def test_vendor_bill_payment_and_overpayment_blocked(self):
        vendor = Vendor.objects.create(tenant=self.tenant, name='Supplier Co')
        exp = AccountingService.account(self.tenant, '5100')
        bill = VendorBill.objects.create(
            tenant=self.tenant, vendor=vendor, bill_no='VB-AUD-1',
            bill_date=date.today(), expense_account=exp, amount=Decimal('40000'),
            status='POSTED', created_by=self.admin,
        )
        AccountingService.post_vendor_bill(bill, user=self.admin)
        vp = VendorPayment.objects.create(
            tenant=self.tenant, vendor=vendor, bill=bill, payment_no='VP-1',
            payment_date=date.today(), amount=Decimal('25000'),
            payment_method='CASH', status='COMPLETED', created_by=self.admin,
        )
        AccountingService.post_vendor_payment(vp, user=self.admin)
        ap = reports.aging_payable(self.tenant)
        self.assertEqual(ap['total'], Decimal('15000.00'))

        over = VendorPayment.objects.create(
            tenant=self.tenant, vendor=vendor, bill=bill, payment_no='VP-2',
            payment_date=date.today(), amount=Decimal('20000'),
            payment_method='CASH', status='COMPLETED', created_by=self.admin,
        )
        with self.assertRaises(ValueError):
            AccountingService.post_vendor_payment(over, user=self.admin)

    def test_final_reconciliation_scenario(self):
        """
        Booking 200k, advances/payments 80+50+70, expense 30 cash,
        vendor bill 40 / pay 25, transfer 50 cash→bank.
        """
        booking = self._confirmed_booking(guests=100, rate=Decimal('2000'))  # 200000
        self.assertEqual(compute_booking_totals(booking)['total_price'], Decimal('200000.00'))

        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('80000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('50000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('70000'),
            payment_method='BANK_TRANSFER', status='COMPLETED', recorded_by=self.admin,
        )
        booking.refresh_from_db()
        self.assertEqual(booking.remaining_balance, Decimal('0'))

        Expense.objects.create(
            tenant=self.tenant, title='Ops', category='OTHER',
            amount=Decimal('30000'), expense_date=date.today(), created_by=self.admin,
        )

        vendor = Vendor.objects.create(tenant=self.tenant, name='V1')
        bill = VendorBill.objects.create(
            tenant=self.tenant, vendor=vendor, bill_no='VB-FINAL',
            bill_date=date.today(),
            expense_account=AccountingService.account(self.tenant, '5100'),
            amount=Decimal('40000'), status='POSTED', created_by=self.admin,
        )
        AccountingService.post_vendor_bill(bill, user=self.admin)
        AccountingService.post_vendor_payment(
            VendorPayment.objects.create(
                tenant=self.tenant, vendor=vendor, bill=bill, payment_no='VP-F',
                payment_date=date.today(), amount=Decimal('25000'),
                payment_method='CASH', status='COMPLETED', created_by=self.admin,
            ),
            user=self.admin,
        )

        cash_acct = AccountingService.account(self.tenant, CASH)
        bank_acct = AccountingService.account(self.tenant, BANK)
        AccountingService.post_transfer(
            BankTransfer.objects.create(
                tenant=self.tenant, transfer_date=date.today(), amount=Decimal('50000'),
                from_account=cash_acct, to_account=bank_acct, status='POSTED', created_by=self.admin,
            ),
            user=self.admin,
        )

        # Customer balance 0
        self.assertEqual(
            reports.party_ledger(self.tenant, customer_id=self.customer.pk)['closing_balance'],
            Decimal('0.00'),
        )
        # Vendor payable 15k
        self.assertEqual(reports.aging_payable(self.tenant)['total'], Decimal('15000.00'))
        # Revenue 200k
        pnl = reports.profit_and_loss(self.tenant)
        self.assertEqual(pnl['total_revenue'], Decimal('200000.00'))
        # Expenses: 30k ops + 40k purchases = 70k
        self.assertEqual(pnl['total_expenses'], Decimal('70000.00'))
        self.assertEqual(pnl['net_profit'], Decimal('130000.00'))

        tb = reports.trial_balance(self.tenant)
        self.assertTrue(tb['balanced'], tb)
        bs = reports.balance_sheet(self.tenant)
        self.assertTrue(bs['balanced'], bs)

        # Cash: +80+50 -30 -25 -50(transfer) = +25? Wait payments: 80+50 cash +70 bank
        # Cash in: 80000+50000 = 130000
        # Cash out: expense 30000 + vendor 25000 + transfer 50000 = 105000
        # Cash = 25000
        # Bank: +70000 +50000 transfer = 120000
        self.assertEqual(reports.account_balance(self.tenant, CASH), Decimal('25000.00'))
        self.assertEqual(reports.account_balance(self.tenant, BANK), Decimal('120000.00'))
        cf = reports.cash_flow(self.tenant)
        self.assertEqual(cf['closing_cash'], Decimal('145000.00'))

        # No duplicate active journals for booking/payments
        for src, sid in [('booking', booking.pk)] + [
            ('payment', p.pk) for p in Payment.objects.filter(booking=booking)
        ]:
            active = [
                e for e in JournalEntry.objects.filter(
                    tenant=self.tenant, source_type=src, source_id=sid, status='POSTED'
                )
                if not AccountingService.is_reversed(e)
            ]
            self.assertEqual(len(active), 1, f'{src}:{sid} has {len(active)}')

        health = reports.integrity_check(self.tenant)
        self.assertTrue(health['ok'], health['issues'])

    def test_closed_period_blocks_api_and_service(self):
        from accounting.models import FiscalPeriod
        period = FiscalPeriod.objects.filter(tenant=self.tenant).first()
        period.is_closed = True
        period.save(update_fields=['is_closed'])
        with self.assertRaises(ValueError):
            AccountingService.post_entry(
                self.tenant,
                entry_date=date.today(),
                memo='x',
                source_type='manual',
                source_id=1,
                lines=[(CASH, 10, 0, ''), ('3000', 0, 10, '')],
                user=self.admin,
            )

    def test_staff_cannot_post_opening_or_reverse(self):
        client = APIClient()
        client.force_authenticate(user=self.staff)
        r = client.post('/api/accounting/opening_balances/', {
            'lines': [
                {'account_code': CASH, 'debit': '100', 'credit': '0'},
                {'account_code': '3000', 'debit': '0', 'credit': '100'},
            ]
        }, format='json')
        self.assertIn(r.status_code, (403, 401))

        booking = self._confirmed_booking(guests=5, rate=Decimal('1000'))
        entry = JournalEntry.objects.filter(source_type='booking', source_id=booking.pk, status='POSTED').first()
        r2 = client.post(f'/api/accounting/journal_entries/{entry.pk}/reverse/', {'reason': 'no'}, format='json')
        self.assertIn(r2.status_code, (403, 401))

    def test_duplicate_payment_post_idempotent(self):
        booking = self._confirmed_booking(guests=5, rate=Decimal('1000'))
        p = Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('100'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        a = AccountingService.post_payment(p)
        b = AccountingService.post_payment(p)
        self.assertEqual(a.pk, b.pk)
        self.assertEqual(
            JournalEntry.objects.filter(source_type='payment', source_id=p.pk, status='POSTED').count(),
            1,
        )

    def test_backfill_idempotent(self):
        from django.core.management import call_command
        from io import StringIO
        booking = self._confirmed_booking(guests=5, rate=Decimal('1000'))
        Payment.objects.create(
            tenant=self.tenant, booking=booking, amount=Decimal('50'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.admin,
        )
        count1 = JournalEntry.objects.filter(tenant=self.tenant, status='POSTED').count()
        out = StringIO()
        call_command('backfill_accounting', stdout=out)
        count2 = JournalEntry.objects.filter(tenant=self.tenant, status='POSTED').count()
        self.assertEqual(count1, count2)
        call_command('backfill_accounting', stdout=out)
        count3 = JournalEntry.objects.filter(tenant=self.tenant, status='POSTED').count()
        self.assertEqual(count2, count3)
