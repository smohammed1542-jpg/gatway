from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .chart import (
    AR,
    CASH,
    DEFAULT_ACCOUNTS,
    EXPENSE_OPS,
    REVENUE_EVENTS,
    REVENUE_STAYS,
    TAX_PAYABLE,
)
from .models import Account, FiscalPeriod, JournalEntry, JournalLine, Tax, AuditLog


def _dec(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


class AccountingService:
    @staticmethod
    def ensure_chart(tenant):
        if not tenant:
            return
        existing = set(
            Account.objects.filter(tenant=tenant).values_list('code', flat=True)
        )
        to_create = [
            Account(tenant=tenant, code=code, name=name, account_type=atype)
            for code, name, atype in DEFAULT_ACCOUNTS
            if code not in existing
        ]
        if to_create:
            Account.objects.bulk_create(to_create)
        if not Tax.objects.filter(tenant=tenant).exists():
            rate = getattr(tenant, 'tax_rate', None) or Decimal('0.05')
            Tax.objects.create(
                tenant=tenant,
                name='Sales tax',
                rate=rate,
                is_default=True,
            )
        year = timezone.localdate().year
        FiscalPeriod.objects.get_or_create(
            tenant=tenant,
            name=str(year),
            defaults={
                'start_date': date(year, 1, 1),
                'end_date': date(year, 12, 31),
            },
        )

    @staticmethod
    def account(tenant, code):
        AccountingService.ensure_chart(tenant)
        return Account.objects.get(tenant=tenant, code=code)

    @staticmethod
    def assert_period_open(tenant, entry_date):
        if not tenant or not entry_date:
            return
        closed = FiscalPeriod.objects.filter(
            tenant=tenant,
            is_closed=True,
            start_date__lte=entry_date,
            end_date__gte=entry_date,
        ).exists()
        if closed:
            raise ValueError('This fiscal period is closed. Reopen the period before posting.')

    @staticmethod
    def find_posted(tenant, source_type, source_id):
        if not tenant or not source_id:
            return None
        return (
            JournalEntry.objects.filter(
                tenant=tenant,
                source_type=source_type,
                source_id=source_id,
                status='POSTED',
                reversed_entry__isnull=True,
            )
            .exclude(reversals__status='POSTED')
            .order_by('-id')
            .first()
        )

    @staticmethod
    def is_reversed(entry):
        return entry and entry.reversals.filter(status='POSTED').exists()

    @staticmethod
    @transaction.atomic
    def post_entry(tenant, *, entry_date, memo, source_type, source_id, lines, user=None):
        """
        lines: iterable of (account_code, debit, credit, description)
        Never overwrites an existing posted entry; caller must reverse first.
        """
        if not tenant:
            return None
        AccountingService.ensure_chart(tenant)
        AccountingService.assert_period_open(tenant, entry_date or timezone.localdate())
        balanced_lines = []
        total_dr = Decimal('0.00')
        total_cr = Decimal('0.00')
        for code, debit, credit, desc in lines:
            dr = _dec(debit)
            cr = _dec(credit)
            if dr == 0 and cr == 0:
                continue
            balanced_lines.append((code, dr, cr, desc or ''))
            total_dr += dr
            total_cr += cr
        if not balanced_lines:
            return None
        if total_dr != total_cr:
            raise ValueError(f'Journal is not balanced: Dr {total_dr} Cr {total_cr}')

        entry = JournalEntry.objects.create(
            tenant=tenant,
            entry_date=entry_date or timezone.localdate(),
            memo=memo or '',
            source_type=source_type,
            source_id=source_id,
            status='POSTED',
            created_by=user if getattr(user, 'is_authenticated', False) else None,
        )
        entry.entry_no = f'JE-{entry.pk:06d}'
        entry.save(update_fields=['entry_no'])

        JournalLine.objects.bulk_create([
            JournalLine(
                journal_entry=entry,
                account=AccountingService.account(tenant, code),
                debit=dr,
                credit=cr,
                description=desc,
            )
            for code, dr, cr, desc in balanced_lines
        ])
        AuditLog.record(
            tenant,
            action='POST',
            entity_type='journal_entry',
            entity_id=entry.pk,
            message=entry.entry_no,
            actor=user,
        )
        return entry

    @staticmethod
    @transaction.atomic
    def reverse_entry(entry, user=None, memo=None):
        if not entry or entry.status != 'POSTED':
            return None
        if AccountingService.is_reversed(entry):
            return entry.reversals.filter(status='POSTED').first()
        lines = [
            (line.account.code, line.credit, line.debit, line.description)
            for line in entry.lines.select_related('account')
        ]
        reversal = AccountingService.post_entry(
            entry.tenant,
            entry_date=timezone.localdate(),
            memo=memo or f'Reversal of {entry.entry_no}',
            source_type='reversal',
            source_id=entry.pk,
            lines=lines,
            user=user,
        )
        if reversal:
            reversal.reversed_entry = entry
            reversal.save(update_fields=['reversed_entry'])
            AuditLog.record(
                entry.tenant,
                action='REVERSE',
                entity_type='journal_entry',
                entity_id=entry.pk,
                message=f'Reversed by {reversal.entry_no}',
                actor=user,
            )
        return reversal

    @staticmethod
    def reverse_source(tenant, source_type, source_id, user=None):
        entry = AccountingService.find_posted(tenant, source_type, source_id)
        if not entry:
            return None
        return AccountingService.reverse_entry(entry, user=user)

    @staticmethod
    def post_booking_invoice(booking, user=None):
        from bookings.pricing import compute_booking_totals

        if not booking or not booking.tenant_id:
            return None
        if booking.booking_status not in ('CONFIRMED', 'COMPLETED'):
            return None
        existing = AccountingService.find_posted(booking.tenant, 'booking', booking.pk)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        totals = compute_booking_totals(booking)
        revenue = _dec(totals['total_before_tax'])
        tax = _dec(totals['tax_amount'])
        total = _dec(totals['total_price'])
        if total <= 0:
            return None
        return AccountingService.post_entry(
            booking.tenant,
            entry_date=booking.event_date or timezone.localdate(),
            memo=f'Sales invoice {booking.booking_id or booking.pk}',
            source_type='booking',
            source_id=booking.pk,
            user=user or booking.created_by,
            lines=[
                (AR, total, 0, 'Accounts receivable'),
                (REVENUE_EVENTS, 0, revenue, 'Event revenue'),
                (TAX_PAYABLE, 0, tax, 'Sales tax'),
            ],
        )

    @staticmethod
    def sync_booking(booking, user=None):
        if not booking or not booking.tenant_id:
            return
        existing = AccountingService.find_posted(booking.tenant, 'booking', booking.pk)
        if booking.booking_status == 'CANCELLED':
            if existing:
                AccountingService.reverse_entry(existing, user=user)
            return
        AccountingService.post_booking_invoice(booking, user=user)

    @staticmethod
    def post_stay_invoice(stay, user=None):
        if not stay or not stay.tenant_id:
            return None
        if stay.status in ('PENDING', 'CANCELLED'):
            return None
        existing = AccountingService.find_posted(stay.tenant, 'stay', stay.pk)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        total = _dec(stay.total_amount)
        if total <= 0:
            return None
        return AccountingService.post_entry(
            stay.tenant,
            entry_date=stay.check_in or timezone.localdate(),
            memo=f'Stay invoice {stay.booking_ref or stay.pk}',
            source_type='stay',
            source_id=stay.pk,
            user=user or stay.created_by,
            lines=[
                (AR, total, 0, 'Accounts receivable'),
                (REVENUE_STAYS, 0, total, 'Stay revenue'),
            ],
        )

    @staticmethod
    def sync_stay(stay, user=None):
        if not stay or not stay.tenant_id:
            return
        existing = AccountingService.find_posted(stay.tenant, 'stay', stay.pk)
        if stay.status == 'CANCELLED':
            if existing:
                AccountingService.reverse_entry(existing, user=user)
            return
        AccountingService.post_stay_invoice(stay, user=user)

    @staticmethod
    def post_payment(payment, user=None):
        if not payment or payment.status != 'COMPLETED':
            return None
        amount = _dec(payment.amount)
        if amount == 0:
            return None
        # Refunds (negative amount) swap sides
        dr_cash, cr_ar = (amount, amount) if amount > 0 else (Decimal('0.00'), Decimal('0.00'))
        if amount < 0:
            amt = abs(amount)
            return AccountingService.post_entry(
                payment.tenant,
                entry_date=timezone.localdate(),
                memo=f'Refund PAY-{payment.pk}',
                source_type='payment',
                source_id=payment.pk,
                user=user or getattr(payment, 'recorded_by', None),
                lines=[
                    (AR, amt, 0, 'Refund to customer'),
                    (CASH, 0, amt, 'Cash refund'),
                ],
            )
        existing = AccountingService.find_posted(payment.tenant, 'payment', payment.pk)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        return AccountingService.post_entry(
            payment.tenant,
            entry_date=timezone.localdate(),
            memo=f'Incoming payment PAY-{payment.pk}',
            source_type='payment',
            source_id=payment.pk,
            user=user or getattr(payment, 'recorded_by', None),
            lines=[
                (CASH, dr_cash, 0, 'Cash received'),
                (AR, 0, cr_ar, 'Apply to receivable'),
            ],
        )

    @staticmethod
    def post_stay_payment(payment, user=None):
        if not payment or payment.status != 'COMPLETED':
            return None
        amount = _dec(payment.amount)
        if amount == 0:
            return None
        existing = AccountingService.find_posted(payment.tenant, 'stay_payment', payment.pk)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        if amount < 0:
            amt = abs(amount)
            return AccountingService.post_entry(
                payment.tenant,
                entry_date=timezone.localdate(),
                memo=f'Stay refund {payment.receipt_ref or payment.pk}',
                source_type='stay_payment',
                source_id=payment.pk,
                user=user or getattr(payment, 'recorded_by', None),
                lines=[
                    (AR, amt, 0, 'Refund to guest'),
                    (CASH, 0, amt, 'Cash refund'),
                ],
            )
        return AccountingService.post_entry(
            payment.tenant,
            entry_date=timezone.localdate(),
            memo=f'Stay payment {payment.receipt_ref or payment.pk}',
            source_type='stay_payment',
            source_id=payment.pk,
            user=user or getattr(payment, 'recorded_by', None),
            lines=[
                (CASH, amount, 0, 'Cash received'),
                (AR, 0, amount, 'Apply to receivable'),
            ],
        )

    @staticmethod
    def post_expense(expense, user=None, source_type='expense'):
        amount = _dec(getattr(expense, 'amount', 0))
        if not expense or amount <= 0:
            return None
        if getattr(expense, 'status', 'POSTED') == 'CANCELLED':
            return None
        existing = AccountingService.find_posted(expense.tenant, source_type, expense.pk)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        title = getattr(expense, 'title', 'Expense')
        entry_date = getattr(expense, 'expense_date', None) or timezone.localdate()
        return AccountingService.post_entry(
            expense.tenant,
            entry_date=entry_date,
            memo=f'Expense: {title}',
            source_type=source_type,
            source_id=expense.pk,
            user=user or getattr(expense, 'created_by', None),
            lines=[
                (EXPENSE_OPS, amount, 0, title),
                (CASH, 0, amount, 'Cash paid'),
            ],
        )
