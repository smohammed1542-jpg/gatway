from decimal import Decimal
from datetime import date, timedelta

from django.test import TestCase

from accounting.models import JournalEntry, JournalLine, Vendor, VendorBill, VendorPayment, BankAccount, BankTransfer
from accounting.services import AccountingService
from accounting import reports
from accounting.chart import AR, CASH, BANK, AP, CUSTOMER_ADVANCES, REVENUE_HALL
from authentication.models import User
from bookings.models import Booking
from bookings.pricing import compute_booking_totals
from core.models import Tenant
from customers.models import Customer
from finance.models import Expense, Payment
from venues.models import Venue


class AccountingPostingTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Hall', subdomain='acct', tax_rate=Decimal('0.05'), overtime_rate_per_hour=Decimal('5000')
        )
        self.user = User.objects.create_user(
            username='acct-admin', email='acct@example.com', password='pass', tenant=self.tenant, role='ADMIN'
        )
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
            gents_count=10,
            ladies_count=10,
            rate_per_head=Decimal('1000'),
            booking_status='CONFIRMED',
            created_by=self.user,
        )

    def test_confirmed_booking_posts_balanced_invoice(self):
        entry = JournalEntry.objects.get(source_type='booking', source_id=self.booking.pk, status='POSTED')
        totals = compute_booking_totals(self.booking)
        dr = sum((l.debit for l in entry.lines.all()), Decimal('0'))
        cr = sum((l.credit for l in entry.lines.all()), Decimal('0'))
        self.assertEqual(dr, cr)
        self.assertEqual(dr, totals['total_price'])

    def test_payment_posts_cash_receipt(self):
        payment = Payment.objects.create(
            tenant=self.tenant,
            booking=self.booking,
            amount=Decimal('5000'),
            payment_method='CASH',
            status='COMPLETED',
            recorded_by=self.user,
        )
        entry = JournalEntry.objects.get(source_type='payment', source_id=payment.pk, status='POSTED')
        self.assertEqual(entry.lines.count(), 2)
        cash_line = entry.lines.get(account__code=CASH)
        self.assertEqual(cash_line.debit, Decimal('5000.00'))

    def test_bank_payment_hits_bank_account(self):
        payment = Payment.objects.create(
            tenant=self.tenant,
            booking=self.booking,
            amount=Decimal('3000'),
            payment_method='BANK_TRANSFER',
            status='COMPLETED',
            recorded_by=self.user,
        )
        entry = JournalEntry.objects.get(source_type='payment', source_id=payment.pk, status='POSTED')
        self.assertTrue(entry.lines.filter(account__code=BANK, debit=Decimal('3000.00')).exists())

    def test_void_payment_reverses_journal_and_keeps_row(self):
        payment = Payment.objects.create(
            tenant=self.tenant,
            booking=self.booking,
            amount=Decimal('1000'),
            payment_method='CASH',
            status='COMPLETED',
        )
        payment.status = 'VOIDED'
        payment.save(update_fields=['status'])
        original = JournalEntry.objects.get(source_type='payment', source_id=payment.pk, reversed_entry__isnull=True)
        self.assertTrue(original.reversals.filter(status='POSTED').exists())
        self.assertTrue(Payment.objects.filter(pk=payment.pk).exists())
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.advance_paid, Decimal('0'))

    def test_expense_posts_and_cancel_reverses(self):
        expense = Expense.objects.create(
            tenant=self.tenant,
            title='Utilities',
            category='UTILITIES',
            amount=Decimal('2000'),
            expense_date=date.today(),
            created_by=self.user,
        )
        self.assertTrue(
            JournalEntry.objects.filter(source_type='expense', source_id=expense.pk, status='POSTED').exists()
        )
        expense.status = 'CANCELLED'
        expense.save(update_fields=['status'])
        original = JournalEntry.objects.get(source_type='expense', source_id=expense.pk, reversed_entry__isnull=True)
        self.assertTrue(original.reversals.filter(status='POSTED').exists())

    def test_cancel_booking_reverses_invoice(self):
        invoice = JournalEntry.objects.get(source_type='booking', source_id=self.booking.pk)
        self.booking.booking_status = 'CANCELLED'
        self.booking.save()
        invoice.refresh_from_db()
        self.assertTrue(invoice.reversals.filter(status='POSTED').exists())

    def test_trial_balance_is_balanced(self):
        totals = JournalLine.objects.filter(
            journal_entry__tenant=self.tenant, journal_entry__status='POSTED'
        ).aggregate(
            # use reports
        )
        tb = reports.trial_balance(self.tenant)
        self.assertTrue(tb['balanced'])
        self.assertEqual(tb['total_debit'], tb['total_credit'])

    def test_closed_period_blocks_posting(self):
        from accounting.models import FiscalPeriod
        period = FiscalPeriod.objects.filter(tenant=self.tenant).first()
        self.assertIsNotNone(period)
        period.is_closed = True
        period.save(update_fields=['is_closed'])
        with self.assertRaises(ValueError):
            AccountingService.post_entry(
                self.tenant,
                entry_date=date.today(),
                memo='Closed',
                source_type='manual',
                source_id=1,
                lines=[('1000', 10, 0, ''), ('4000', 0, 10, '')],
                user=self.user,
            )

    def test_unbalanced_journal_rejected(self):
        with self.assertRaises(ValueError):
            AccountingService.post_entry(
                self.tenant,
                entry_date=date.today(),
                memo='Bad',
                source_type='manual',
                source_id=99,
                lines=[('1000', 100, 0, ''), ('4000', 0, 50, '')],
                user=self.user,
            )

    def test_pending_payment_credits_advances(self):
        pending = Booking.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            venue=self.venue,
            event_name='Pending Ev',
            event_date=date.today() + timedelta(days=30),
            slot='evening',
            gents_count=5,
            ladies_count=5,
            rate_per_head=Decimal('1000'),
            booking_status='PENDING',
            created_by=self.user,
        )
        self.assertFalse(
            JournalEntry.objects.filter(source_type='booking', source_id=pending.pk, status='POSTED').exists()
        )
        payment = Payment.objects.create(
            tenant=self.tenant,
            booking=pending,
            amount=Decimal('2000'),
            payment_method='CASH',
            status='COMPLETED',
            recorded_by=self.user,
        )
        entry = JournalEntry.objects.get(source_type='payment', source_id=payment.pk, status='POSTED')
        self.assertTrue(entry.lines.filter(account__code=CUSTOMER_ADVANCES, credit=Decimal('2000.00')).exists())

    def test_refund_posts_correctly(self):
        payment = Payment.objects.create(
            tenant=self.tenant,
            booking=self.booking,
            amount=Decimal('-500'),
            payment_method='CASH',
            status='COMPLETED',
            recorded_by=self.user,
        )
        entry = JournalEntry.objects.get(source_type='payment', source_id=payment.pk, status='POSTED')
        self.assertTrue(entry.lines.filter(account__code=AR, debit=Decimal('500.00')).exists())
        self.assertTrue(entry.lines.filter(account__code=CASH, credit=Decimal('500.00')).exists())

    def test_vendor_bill_and_payment(self):
        AccountingService.ensure_chart(self.tenant)
        vendor = Vendor.objects.create(tenant=self.tenant, name='ABC Supplies')
        exp_acct = AccountingService.account(self.tenant, '5100')
        bill = VendorBill.objects.create(
            tenant=self.tenant,
            vendor=vendor,
            bill_no='VB-TEST-1',
            bill_date=date.today(),
            expense_account=exp_acct,
            amount=Decimal('50000'),
            description='Purchase',
            status='POSTED',
            created_by=self.user,
        )
        AccountingService.post_vendor_bill(bill, user=self.user)
        entry = JournalEntry.objects.get(source_type='vendor_bill', source_id=bill.pk, status='POSTED')
        self.assertTrue(entry.lines.filter(account__code=AP, credit=Decimal('50000.00')).exists())

        vp = VendorPayment.objects.create(
            tenant=self.tenant,
            vendor=vendor,
            bill=bill,
            payment_no='VP-1',
            payment_date=date.today(),
            amount=Decimal('50000'),
            payment_method='CASH',
            status='COMPLETED',
            created_by=self.user,
        )
        AccountingService.post_vendor_payment(vp, user=self.user)
        pay_entry = JournalEntry.objects.get(source_type='vendor_payment', source_id=vp.pk, status='POSTED')
        self.assertTrue(pay_entry.lines.filter(account__code=AP, debit=Decimal('50000.00')).exists())
        bill.refresh_from_db()
        self.assertEqual(bill.status, 'PAID')

    def test_cash_transfer(self):
        AccountingService.ensure_chart(self.tenant)
        cash = AccountingService.account(self.tenant, CASH)
        bank = AccountingService.account(self.tenant, BANK)
        tr = BankTransfer.objects.create(
            tenant=self.tenant,
            transfer_date=date.today(),
            amount=Decimal('50000'),
            from_account=cash,
            to_account=bank,
            memo='Cash to bank',
            status='POSTED',
            created_by=self.user,
        )
        AccountingService.post_transfer(tr, user=self.user)
        entry = JournalEntry.objects.get(source_type='transfer', source_id=tr.pk, status='POSTED')
        self.assertTrue(entry.lines.filter(account__code=BANK, debit=Decimal('50000.00')).exists())
        self.assertTrue(entry.lines.filter(account__code=CASH, credit=Decimal('50000.00')).exists())
        # Not income
        self.assertFalse(entry.lines.filter(account__account_type='REVENUE').exists())

    def test_duplicate_payment_prevented(self):
        payment = Payment.objects.create(
            tenant=self.tenant,
            booking=self.booking,
            amount=Decimal('100'),
            payment_method='CASH',
            status='COMPLETED',
            recorded_by=self.user,
        )
        first = AccountingService.post_payment(payment)
        second = AccountingService.post_payment(payment)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(
            JournalEntry.objects.filter(source_type='payment', source_id=payment.pk, status='POSTED').count(),
            1,
        )

    def test_reversal_of_posted_entry(self):
        entry = JournalEntry.objects.get(source_type='booking', source_id=self.booking.pk, status='POSTED')
        rev = AccountingService.reverse_entry(entry, user=self.user, reason='Test reverse')
        self.assertIsNotNone(rev)
        entry.refresh_from_db()
        self.assertEqual(entry.status, 'REVERSED')

    def test_profit_and_loss_and_balance_sheet(self):
        Payment.objects.create(
            tenant=self.tenant, booking=self.booking, amount=Decimal('1000'),
            payment_method='CASH', status='COMPLETED', recorded_by=self.user,
        )
        Expense.objects.create(
            tenant=self.tenant, title='Salary', category='SALARY',
            amount=Decimal('500'), expense_date=date.today(), created_by=self.user,
        )
        pnl = reports.profit_and_loss(self.tenant)
        self.assertGreater(pnl['total_revenue'], 0)
        self.assertGreater(pnl['total_expenses'], 0)
        bs = reports.balance_sheet(self.tenant)
        self.assertIn('total_assets', bs)
        cf = reports.cash_flow(self.tenant)
        self.assertIn('closing_cash', cf)
        ar = reports.aging_receivable(self.tenant)
        self.assertIn('buckets', ar)
        dash = reports.accounting_dashboard(self.tenant)
        self.assertIn('cash_balance', dash)

    def test_discount_in_pricing(self):
        self.booking.discount_amount = Decimal('1000')
        self.booking.save()
        totals = compute_booking_totals(self.booking)
        self.assertEqual(totals['discount_amount'], Decimal('1000.00'))
        self.assertLess(totals['total_price'], Decimal('21000.00'))

    def test_integrity_check_runs(self):
        result = reports.integrity_check(self.tenant)
        self.assertIn('ok', result)
        self.assertIn('issues', result)
