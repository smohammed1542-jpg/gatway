from decimal import Decimal
from datetime import date, timedelta

from django.test import TestCase

from accounting.models import JournalEntry, JournalLine
from accounting.services import AccountingService
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
        from accounting.models import JournalLine
        from django.db.models import Sum
        totals = JournalLine.objects.filter(
            journal_entry__tenant=self.tenant, journal_entry__status='POSTED'
        ).aggregate(dr=Sum('debit'), cr=Sum('credit'))
        self.assertEqual(totals['dr'], totals['cr'])

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
