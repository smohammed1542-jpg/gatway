from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from .chart import (
    AP,
    AR,
    BANK,
    CASH,
    CATEGORY_TO_EXPENSE_ACCOUNT,
    CUSTOMER_ADVANCES,
    DEFAULT_ACCOUNTS,
    DISCOUNT_ALLOWED,
    EXPENSE_OPS,
    OPENING_EQUITY,
    REVENUE_CATERING,
    REVENUE_DECORATION,
    REVENUE_HALL,
    REVENUE_OTHER_SERVICE,
    REVENUE_STAYS,
    SYSTEM_ACCOUNT_CODES,
    TAX_PAYABLE,
)
from .models import (
    Account,
    AuditLog,
    BankAccount,
    FiscalPeriod,
    Invoice,
    JournalEntry,
    JournalLine,
    Tax,
)


def _dec(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def _line_tuple(code, debit, credit, desc, **refs):
    """Normalize a posting line: (code, debit, credit, desc, refs_dict)."""
    return (code, _dec(debit), _dec(credit), desc or '', refs or {})


class AccountingService:
    @staticmethod
    def ensure_chart(tenant):
        if not tenant:
            return
        existing = {
            a.code: a for a in Account.objects.filter(tenant=tenant)
        }
        to_create = []
        for code, name, atype in DEFAULT_ACCOUNTS:
            if code not in existing:
                to_create.append(
                    Account(
                        tenant=tenant,
                        code=code,
                        name=name,
                        account_type=atype,
                        is_system=code in SYSTEM_ACCOUNT_CODES,
                    )
                )
            else:
                acc = existing[code]
                updates = []
                if not acc.is_system and code in SYSTEM_ACCOUNT_CODES:
                    acc.is_system = True
                    updates.append('is_system')
                # Rename legacy Event Revenue → Hall Booking Revenue
                if code == '4000' and acc.name == 'Event Revenue':
                    acc.name = name
                    updates.append('name')
                if updates:
                    acc.save(update_fields=updates + ['updated_at'])
        if to_create:
            Account.objects.bulk_create(to_create)

        if not Tax.objects.filter(tenant=tenant).exists():
            rate = getattr(tenant, 'tax_rate', None) or Decimal('0.05')
            tax_acct = Account.objects.filter(tenant=tenant, code=TAX_PAYABLE).first()
            Tax.objects.create(
                tenant=tenant,
                name='Sales tax',
                rate=rate,
                tax_account=tax_acct,
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
        # Ensure a default bank account linked to GL Bank
        if not BankAccount.objects.filter(tenant=tenant).exists():
            bank_gl = Account.objects.filter(tenant=tenant, code=BANK).first()
            if bank_gl:
                BankAccount.objects.create(
                    tenant=tenant,
                    bank_name='Primary Bank',
                    account_name='Operating Account',
                    gl_account=bank_gl,
                    is_default=True,
                )

    @staticmethod
    def account(tenant, code):
        AccountingService.ensure_chart(tenant)
        return Account.objects.get(tenant=tenant, code=code)

    @staticmethod
    def default_bank_account(tenant):
        AccountingService.ensure_chart(tenant)
        return (
            BankAccount.objects.filter(tenant=tenant, is_active=True, is_default=True).first()
            or BankAccount.objects.filter(tenant=tenant, is_active=True).first()
        )

    @staticmethod
    def cash_or_bank_code(payment_method, bank_account=None, tenant=None):
        """Return (account_code, bank_account_id) for the cash side of a payment."""
        if payment_method == 'CASH':
            return CASH, getattr(bank_account, 'pk', None) if bank_account else None
        if bank_account is not None:
            gl = getattr(bank_account, 'gl_account', None)
            code = gl.code if gl is not None else BANK
            return code, bank_account.pk
        if tenant is not None:
            ba = AccountingService.default_bank_account(tenant)
            if ba is not None:
                return ba.gl_account.code, ba.pk
        return BANK, None

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
    def find_posted(tenant, source_type, source_id, *, lock=False):
        if not tenant or source_id is None:
            return None
        qs = JournalEntry.objects.filter(
            tenant=tenant,
            source_type=source_type,
            source_id=source_id,
            status='POSTED',
            reversed_entry__isnull=True,
        ).exclude(reversals__status='POSTED')
        if lock:
            qs = qs.select_for_update()
        return qs.order_by('-id').first()

    @staticmethod
    def is_reversed(entry):
        return entry and (
            entry.status == 'REVERSED'
            or entry.reversals.filter(status='POSTED').exists()
        )

    @staticmethod
    def _entry_ar_total(entry):
        if not entry:
            return Decimal('0.00')
        total = Decimal('0.00')
        for line in entry.lines.select_related('account'):
            if line.account.code == AR:
                total += line.debit - line.credit
        return _dec(total)

    @staticmethod
    def _validate_lines(lines):
        """
        lines: iterable of (code, debit, credit, desc) or
               (code, debit, credit, desc, refs_dict)
        """
        balanced_lines = []
        total_dr = Decimal('0.00')
        total_cr = Decimal('0.00')
        for item in lines:
            if len(item) == 5:
                code, debit, credit, desc, refs = item
            else:
                code, debit, credit, desc = item
                refs = {}
            dr = _dec(debit)
            cr = _dec(credit)
            if dr < 0 or cr < 0:
                raise ValueError('Debit and credit must be non-negative.')
            if dr > 0 and cr > 0:
                raise ValueError('A journal line cannot have both debit and credit.')
            if dr == 0 and cr == 0:
                continue
            balanced_lines.append((code, dr, cr, desc or '', refs or {}))
            total_dr += dr
            total_cr += cr
        if not balanced_lines:
            return [], Decimal('0.00'), Decimal('0.00')
        if total_dr != total_cr:
            raise ValueError(f'Journal is not balanced: Dr {total_dr} Cr {total_cr}')
        has_debit = any(dr > 0 for _, dr, _, _, _ in balanced_lines)
        has_credit = any(cr > 0 for _, _, cr, _, _ in balanced_lines)
        if not has_debit or not has_credit:
            raise ValueError('Journal requires at least one debit and one credit.')
        return balanced_lines, total_dr, total_cr

    @staticmethod
    @transaction.atomic
    def post_entry(
        tenant,
        *,
        entry_date,
        memo,
        source_type,
        source_id,
        lines,
        user=None,
        status='POSTED',
    ):
        """
        lines: iterable of (account_code, debit, credit, description[, refs])
        Never overwrites an existing posted entry; caller must reverse first.
        """
        if not tenant:
            return None
        AccountingService.ensure_chart(tenant)
        entry_date = entry_date or timezone.localdate()
        if status == 'POSTED':
            AccountingService.assert_period_open(tenant, entry_date)

        balanced_lines, _total_dr, _total_cr = AccountingService._validate_lines(lines)
        if not balanced_lines:
            return None

        active_key = None
        if status == 'POSTED':
            active_key = JournalEntry.make_active_source_key(source_type, source_id)
            if active_key:
                existing = AccountingService.find_posted(tenant, source_type, source_id, lock=True)
                if existing and not AccountingService.is_reversed(existing):
                    return existing

        try:
            with transaction.atomic():
                entry = JournalEntry.objects.create(
                    tenant=tenant,
                    entry_date=entry_date,
                    memo=memo or '',
                    source_type=source_type,
                    source_id=source_id,
                    active_source_key=active_key,
                    status=status,
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
                        customer_id=refs.get('customer_id'),
                        vendor_id=refs.get('vendor_id'),
                        booking_id=refs.get('booking_id'),
                        stay_id=refs.get('stay_id'),
                        bank_account_id=refs.get('bank_account_id'),
                    )
                    for code, dr, cr, desc, refs in balanced_lines
                ])
        except IntegrityError:
            # Concurrent duplicate source post — return the winner
            existing = AccountingService.find_posted(tenant, source_type, source_id)
            if existing:
                return existing
            raise

        AuditLog.record(
            tenant,
            action='POST' if status == 'POSTED' else 'CREATE',
            entity_type='journal_entry',
            entity_id=entry.pk,
            message=entry.entry_no,
            actor=user,
        )
        return entry

    @staticmethod
    @transaction.atomic
    def create_draft(tenant, *, entry_date, memo, lines, user=None, source_type='manual', source_id=None):
        return AccountingService.post_entry(
            tenant,
            entry_date=entry_date,
            memo=memo,
            source_type=source_type,
            source_id=source_id,
            lines=lines,
            user=user,
            status='DRAFT',
        )

    @staticmethod
    @transaction.atomic
    def post_draft(entry, user=None):
        if not entry or entry.status != 'DRAFT':
            raise ValueError('Only draft entries can be posted.')
        AccountingService.assert_period_open(entry.tenant, entry.entry_date)
        lines = list(entry.lines.all())
        total_dr = sum((l.debit for l in lines), Decimal('0'))
        total_cr = sum((l.credit for l in lines), Decimal('0'))
        if total_dr != total_cr or total_dr == 0:
            raise ValueError(f'Draft is not balanced: Dr {total_dr} Cr {total_cr}')
        key = JournalEntry.make_active_source_key(entry.source_type, entry.source_id)
        if key:
            existing = AccountingService.find_posted(
                entry.tenant, entry.source_type, entry.source_id, lock=True
            )
            if existing and existing.pk != entry.pk and not AccountingService.is_reversed(existing):
                raise ValueError('An active journal already exists for this source.')
        entry.status = 'POSTED'
        entry.active_source_key = key
        try:
            entry.save(update_fields=['status', 'active_source_key', 'updated_at'])
        except IntegrityError as exc:
            raise ValueError('An active journal already exists for this source.') from exc
        AuditLog.record(
            entry.tenant,
            action='POST',
            entity_type='journal_entry',
            entity_id=entry.pk,
            message=entry.entry_no,
            actor=user,
        )
        return entry

    @staticmethod
    @transaction.atomic
    def reverse_entry(entry, user=None, memo=None, reason=''):
        if not entry or entry.status not in ('POSTED',):
            return None
        if AccountingService.is_reversed(entry):
            return entry.reversals.filter(status='POSTED').first()
        lines = [
            (line.account.code, line.credit, line.debit, line.description, {
                'customer_id': line.customer_id,
                'vendor_id': line.vendor_id,
                'booking_id': line.booking_id,
                'stay_id': line.stay_id,
                'bank_account_id': line.bank_account_id,
            })
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
            entry.status = 'REVERSED'
            entry.active_source_key = None
            entry.save(update_fields=['status', 'active_source_key', 'updated_at'])
            AuditLog.record(
                entry.tenant,
                action='REVERSE',
                entity_type='journal_entry',
                entity_id=entry.pk,
                message=f'Reversed by {reversal.entry_no}',
                actor=user,
                reason=reason,
            )
        return reversal

    @staticmethod
    def reverse_source(tenant, source_type, source_id, user=None, reason=''):
        entry = AccountingService.find_posted(tenant, source_type, source_id)
        if not entry:
            return None
        return AccountingService.reverse_entry(entry, user=user, reason=reason)

    @staticmethod
    def _booking_refs(booking):
        return {
            'customer_id': getattr(booking, 'customer_id', None),
            'booking_id': booking.pk,
        }

    @staticmethod
    @transaction.atomic
    def post_booking_invoice(booking, user=None):
        from bookings.pricing import compute_booking_totals

        if not booking or not booking.tenant_id:
            return None
        if booking.booking_status not in ('CONFIRMED', 'COMPLETED'):
            return None

        totals = compute_booking_totals(booking)
        tax = _dec(totals['tax_amount'])
        total = _dec(totals['total_price'])
        discount = _dec(totals.get('discount_amount', 0))

        existing = AccountingService.find_posted(booking.tenant, 'booking', booking.pk, lock=True)
        if existing and not AccountingService.is_reversed(existing):
            posted_ar = AccountingService._entry_ar_total(existing)
            if posted_ar == total:
                AccountingService._sync_invoice_document(booking, totals, user=user)
                return existing
            # Financial amount changed — reverse then repost (never silent edit).
            AccountingService.reverse_entry(
                existing,
                user=user,
                reason=f'Booking amount changed from {posted_ar} to {total}',
                memo=f'Reversal of {existing.entry_no} (amount correction)',
            )
            AuditLog.record(
                booking.tenant,
                action='REVERSE',
                entity_type='booking',
                entity_id=booking.pk,
                message=f'Amount correction {posted_ar} → {total}',
                actor=user,
                reason='Booking financial fields changed',
                previous_value={'ar_total': str(posted_ar)},
                new_value={'ar_total': str(total)},
            )

        if total <= 0 and discount <= 0:
            return None

        refs = AccountingService._booking_refs(booking)
        hall_rev = _dec(totals['subtotal'])
        deco_rev = _dec(totals['decoration_charge'])
        cater_rev = _dec(totals['kitchen_charge'])
        other_rev = _dec(totals['overtime_charge']) + _dec(totals['generator_charge'])

        lines = [
            _line_tuple(AR, total, 0, 'Accounts receivable', **refs),
        ]
        if hall_rev > 0:
            lines.append(_line_tuple(REVENUE_HALL, 0, hall_rev, 'Hall booking revenue', **refs))
        if deco_rev > 0:
            lines.append(_line_tuple(REVENUE_DECORATION, 0, deco_rev, 'Decorations revenue', **refs))
        if cater_rev > 0:
            lines.append(_line_tuple(REVENUE_CATERING, 0, cater_rev, 'Catering revenue', **refs))
        if other_rev > 0:
            lines.append(_line_tuple(REVENUE_OTHER_SERVICE, 0, other_rev, 'Other service revenue', **refs))
        if discount > 0:
            lines.append(_line_tuple(DISCOUNT_ALLOWED, discount, 0, 'Discount allowed', **refs))
        if tax > 0:
            lines.append(_line_tuple(TAX_PAYABLE, 0, tax, 'Sales tax', **refs))

        credit_total = sum((l[2] for l in lines), Decimal('0'))
        debit_total = sum((l[1] for l in lines), Decimal('0'))
        if debit_total != credit_total:
            gap = debit_total - credit_total
            if gap > 0:
                lines.append(_line_tuple(REVENUE_HALL, 0, gap, 'Hall booking revenue', **refs))
            elif gap < 0:
                lines.append(_line_tuple(DISCOUNT_ALLOWED, abs(gap), 0, 'Discount balancing', **refs))

        entry = AccountingService.post_entry(
            booking.tenant,
            entry_date=booking.event_date or timezone.localdate(),
            memo=f'Sales invoice {booking.booking_id or booking.pk}',
            source_type='booking',
            source_id=booking.pk,
            user=user or booking.created_by,
            lines=lines,
        )

        AccountingService._apply_advances_on_confirm(booking, user=user)
        AccountingService._sync_invoice_document(booking, totals, user=user)
        return entry

    @staticmethod
    def _sync_invoice_document(booking, totals=None, user=None):
        """Create or update the customer Invoice document (never posts a journal)."""
        if not booking or not booking.tenant_id:
            return None
        from bookings.pricing import compute_booking_totals
        totals = totals or compute_booking_totals(booking)
        inv = Invoice.objects.filter(tenant=booking.tenant, booking=booking).exclude(
            status='CANCELLED'
        ).first()
        payload = {
            'subtotal': _dec(totals.get('taxable_base') or totals.get('total_before_tax')),
            'discount': _dec(totals.get('discount_amount', 0)),
            'tax': _dec(totals['tax_amount']),
            'total': _dec(totals['total_price']),
            'amount_paid': _dec(booking.advance_paid),
        }
        if inv:
            for k, v in payload.items():
                setattr(inv, k, v)
            inv.save(update_fields=list(payload.keys()) + ['updated_at'])
            AccountingService._refresh_invoice_status(inv)
            return inv
        return AccountingService.ensure_invoice_for_booking(booking, totals, user=user)
    @staticmethod
    def _apply_advances_on_confirm(booking, user=None):
        """When booking is confirmed, move Customer Advances → credit against AR conceptually
        by posting: Dr Advances / Cr AR for amounts previously received while PENDING."""
        from finance.models import Payment

        if not booking or not booking.tenant_id:
            return
        # Payments already posted to Advances (source payment) while pending —
        # find payments that credited advances: we detect via journal lines on CUSTOMER_ADVANCES
        advance_lines = JournalLine.objects.filter(
            journal_entry__tenant=booking.tenant,
            journal_entry__status='POSTED',
            journal_entry__source_type='payment',
            booking_id=booking.pk,
            account__code=CUSTOMER_ADVANCES,
            credit__gt=0,
        ).select_related('journal_entry')
        total_adv = sum((l.credit for l in advance_lines), Decimal('0'))
        # Subtract any prior apply journals
        already = AccountingService.find_posted(booking.tenant, 'adjustment', booking.pk)
        if already and not AccountingService.is_reversed(already):
            return
        if total_adv <= 0:
            return
        refs = AccountingService._booking_refs(booking)
        AccountingService.post_entry(
            booking.tenant,
            entry_date=timezone.localdate(),
            memo=f'Apply advances to AR for {booking.booking_id or booking.pk}',
            source_type='adjustment',
            source_id=booking.pk,
            user=user,
            lines=[
                _line_tuple(CUSTOMER_ADVANCES, total_adv, 0, 'Apply customer advance', **refs),
                _line_tuple(AR, 0, total_adv, 'Reduce receivable', **refs),
            ],
        )

    @staticmethod
    def ensure_invoice_for_booking(booking, totals=None, user=None):
        if not booking or not booking.tenant_id:
            return None
        existing = Invoice.objects.filter(tenant=booking.tenant, booking=booking).exclude(
            status='CANCELLED'
        ).first()
        if existing:
            return existing
        from bookings.pricing import compute_booking_totals
        totals = totals or compute_booking_totals(booking)
        inv = Invoice.objects.create(
            tenant=booking.tenant,
            customer=booking.customer,
            booking=booking,
            invoice_date=booking.event_date or timezone.localdate(),
            due_date=booking.event_date,
            status='ISSUED',
            subtotal=_dec(totals.get('taxable_base') or totals.get('total_before_tax')),
            discount=_dec(totals.get('discount_amount', 0)),
            tax=_dec(totals['tax_amount']),
            total=_dec(totals['total_price']),
            amount_paid=_dec(booking.advance_paid),
            created_by=user or booking.created_by,
            invoice_no=f'TMP-{booking.pk}-{timezone.now().timestamp()}',
        )
        inv.invoice_no = f'INV-{inv.pk:06d}'
        inv.save(update_fields=['invoice_no'])
        AccountingService._refresh_invoice_status(inv)
        return inv

    @staticmethod
    def _refresh_invoice_status(invoice):
        if not invoice or invoice.status == 'CANCELLED':
            return
        paid = _dec(invoice.amount_paid)
        total = _dec(invoice.total)
        if paid <= 0:
            invoice.status = 'ISSUED'
        elif paid >= total:
            invoice.status = 'PAID'
        else:
            invoice.status = 'PARTIAL'
        if invoice.due_date and invoice.status in ('ISSUED', 'PARTIAL'):
            if invoice.due_date < timezone.localdate():
                invoice.status = 'OVERDUE'
        invoice.save(update_fields=['status', 'updated_at'])

    @staticmethod
    def sync_booking(booking, user=None):
        if not booking or not booking.tenant_id:
            return
        existing = AccountingService.find_posted(booking.tenant, 'booking', booking.pk)
        if booking.booking_status == 'CANCELLED':
            if existing:
                AccountingService.reverse_entry(existing, user=user, reason='Booking cancelled')
            adj = AccountingService.find_posted(booking.tenant, 'adjustment', booking.pk)
            if adj:
                AccountingService.reverse_entry(adj, user=user, reason='Booking cancelled')
            Invoice.objects.filter(booking=booking, tenant=booking.tenant).exclude(
                status='CANCELLED'
            ).update(status='CANCELLED')
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
        refs = {
            'customer_id': getattr(stay, 'customer_id', None),
            'stay_id': stay.pk,
        }
        entry = AccountingService.post_entry(
            stay.tenant,
            entry_date=stay.check_in or timezone.localdate(),
            memo=f'Stay invoice {stay.booking_ref or stay.pk}',
            source_type='stay',
            source_id=stay.pk,
            user=user or stay.created_by,
            lines=[
                _line_tuple(AR, total, 0, 'Accounts receivable', **refs),
                _line_tuple(REVENUE_STAYS, 0, total, 'Stay revenue', **refs),
            ],
        )
        AccountingService.ensure_invoice_for_stay(stay, user=user)
        return entry

    @staticmethod
    def ensure_invoice_for_stay(stay, user=None):
        if not stay or not stay.tenant_id or not stay.customer_id:
            return None
        existing = Invoice.objects.filter(tenant=stay.tenant, stay=stay).exclude(
            status='CANCELLED'
        ).first()
        if existing:
            return existing
        total = _dec(stay.total_amount)
        inv = Invoice.objects.create(
            tenant=stay.tenant,
            customer_id=stay.customer_id,
            stay=stay,
            invoice_date=stay.check_in or timezone.localdate(),
            due_date=stay.check_out,
            status='ISSUED',
            subtotal=total,
            discount=Decimal('0.00'),
            tax=Decimal('0.00'),
            total=total,
            amount_paid=_dec(stay.advance_paid),
            created_by=user or stay.created_by,
            invoice_no=f'TMP-STAY-{stay.pk}-{timezone.now().timestamp()}',
        )
        inv.invoice_no = f'INV-{inv.pk:06d}'
        inv.save(update_fields=['invoice_no'])
        AccountingService._refresh_invoice_status(inv)
        return inv

    @staticmethod
    def sync_stay(stay, user=None):
        if not stay or not stay.tenant_id:
            return
        existing = AccountingService.find_posted(stay.tenant, 'stay', stay.pk)
        if stay.status == 'CANCELLED':
            if existing:
                AccountingService.reverse_entry(existing, user=user, reason='Stay cancelled')
            Invoice.objects.filter(stay=stay, tenant=stay.tenant).exclude(
                status='CANCELLED'
            ).update(status='CANCELLED')
            return
        AccountingService.post_stay_invoice(stay, user=user)

    @staticmethod
    @transaction.atomic
    def post_payment(payment, user=None):
        if not payment or payment.status != 'COMPLETED':
            return None
        amount = _dec(payment.amount)
        if amount == 0:
            return None

        booking = payment.booking
        cash_code, bank_id = AccountingService.cash_or_bank_code(
            payment.payment_method,
            getattr(payment, 'bank_account', None),
            tenant=payment.tenant,
        )
        refs = {
            'customer_id': getattr(booking, 'customer_id', None) if booking else None,
            'booking_id': booking.pk if booking else None,
            'bank_account_id': getattr(payment, 'bank_account_id', None) or bank_id,
        }

        # Refunds
        if amount < 0:
            existing = AccountingService.find_posted(payment.tenant, 'payment', payment.pk, lock=True)
            if existing and not AccountingService.is_reversed(existing):
                return existing
            amt = abs(amount)
            has_invoice = bool(
                booking
                and AccountingService.find_posted(payment.tenant, 'booking', booking.pk)
            )
            liability = AR if has_invoice else CUSTOMER_ADVANCES
            return AccountingService.post_entry(
                payment.tenant,
                entry_date=timezone.localdate(),
                memo=f'Refund {payment.receipt_no or f"PAY-{payment.pk}"}',
                source_type='payment',
                source_id=payment.pk,
                user=user or getattr(payment, 'recorded_by', None),
                lines=[
                    _line_tuple(liability, amt, 0, 'Refund to customer', **refs),
                    _line_tuple(cash_code, 0, amt, 'Cash/bank refund', **refs),
                ],
            )

        existing = AccountingService.find_posted(payment.tenant, 'payment', payment.pk, lock=True)
        if existing and not AccountingService.is_reversed(existing):
            return existing

        has_invoice = bool(
            booking
            and AccountingService.find_posted(payment.tenant, 'booking', booking.pk)
        )
        credit_acct = AR if has_invoice else CUSTOMER_ADVANCES
        credit_desc = 'Apply to receivable' if has_invoice else 'Customer advance'

        entry = AccountingService.post_entry(
            payment.tenant,
            entry_date=timezone.localdate(),
            memo=f'Incoming payment {payment.receipt_no or f"PAY-{payment.pk}"}',
            source_type='payment',
            source_id=payment.pk,
            user=user or getattr(payment, 'recorded_by', None),
            lines=[
                _line_tuple(cash_code, amount, 0, 'Cash/bank received', **refs),
                _line_tuple(credit_acct, 0, amount, credit_desc, **refs),
            ],
        )
        if booking:
            inv = Invoice.objects.filter(
                tenant=payment.tenant, booking=booking
            ).exclude(status='CANCELLED').first()
            if inv:
                inv.amount_paid = _dec(booking.advance_paid)
                inv.save(update_fields=['amount_paid', 'updated_at'])
                AccountingService._refresh_invoice_status(inv)
        return entry

    @staticmethod
    @transaction.atomic
    def post_stay_payment(payment, user=None):
        if not payment or payment.status != 'COMPLETED':
            return None
        amount = _dec(payment.amount)
        if amount == 0:
            return None
        existing = AccountingService.find_posted(payment.tenant, 'stay_payment', payment.pk, lock=True)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        stay = payment.stay
        refs = {
            'customer_id': getattr(stay, 'customer_id', None) if stay else None,
            'stay_id': stay.pk if stay else None,
        }
        cash_code, bank_id = AccountingService.cash_or_bank_code(
            getattr(payment, 'payment_method', 'CASH'),
            getattr(payment, 'bank_account', None),
            tenant=payment.tenant,
        )
        refs['bank_account_id'] = bank_id
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
                    _line_tuple(AR, amt, 0, 'Refund to guest', **refs),
                    _line_tuple(cash_code, 0, amt, 'Cash refund', **refs),
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
                _line_tuple(cash_code, amount, 0, 'Cash received', **refs),
                _line_tuple(AR, 0, amount, 'Apply to receivable', **refs),
            ],
        )

    @staticmethod
    def resolve_expense_account_code(expense):
        if getattr(expense, 'account_id', None) and expense.account:
            return expense.account.code
        # Parse frontend account title tag
        desc = getattr(expense, 'description', '') or ''
        if '[Account Title:' in desc:
            from .chart import ACCOUNT_TITLE_TO_GL
            import re
            m = re.search(r'\[Account Title:\s*(.*?)\]', desc)
            if m:
                code = ACCOUNT_TITLE_TO_GL.get(m.group(1).strip())
                if code:
                    return code
        return CATEGORY_TO_EXPENSE_ACCOUNT.get(
            getattr(expense, 'category', 'OTHER'), EXPENSE_OPS
        )

    @staticmethod
    @transaction.atomic
    def post_expense(expense, user=None, source_type='expense'):
        amount = _dec(getattr(expense, 'amount', 0))
        if not expense or amount <= 0:
            return None
        if getattr(expense, 'status', 'POSTED') == 'CANCELLED':
            return None
        existing = AccountingService.find_posted(expense.tenant, source_type, expense.pk, lock=True)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        title = getattr(expense, 'title', 'Expense')
        entry_date = getattr(expense, 'expense_date', None) or timezone.localdate()
        exp_code = AccountingService.resolve_expense_account_code(expense)
        paid_through = getattr(expense, 'paid_through', 'CASH') or 'CASH'
        refs = {
            'vendor_id': getattr(expense, 'vendor_id', None),
            'bank_account_id': getattr(expense, 'bank_account_id', None),
        }
        if paid_through == 'AP':
            credit_code, credit_desc = AP, 'Accounts payable'
        elif paid_through == 'BANK':
            cash_code, bank_id = AccountingService.cash_or_bank_code(
                'BANK_TRANSFER',
                getattr(expense, 'bank_account', None),
                tenant=expense.tenant,
            )
            credit_code, credit_desc = cash_code, 'Bank paid'
            refs['bank_account_id'] = refs.get('bank_account_id') or bank_id
        else:
            credit_code, credit_desc = CASH, 'Cash paid'

        return AccountingService.post_entry(
            expense.tenant,
            entry_date=entry_date,
            memo=f'Expense: {title}',
            source_type=source_type,
            source_id=expense.pk,
            user=user or getattr(expense, 'created_by', None),
            lines=[
                _line_tuple(exp_code, amount, 0, title, **refs),
                _line_tuple(credit_code, 0, amount, credit_desc, **refs),
            ],
        )

    @staticmethod
    @transaction.atomic
    def post_vendor_bill(bill, user=None):
        if not bill or bill.status == 'CANCELLED':
            return None
        amount = _dec(bill.amount)
        if amount <= 0:
            return None
        existing = AccountingService.find_posted(bill.tenant, 'vendor_bill', bill.pk, lock=True)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        refs = {'vendor_id': bill.vendor_id}
        exp_code = bill.expense_account.code if bill.expense_account_id else EXPENSE_OPS
        entry = AccountingService.post_entry(
            bill.tenant,
            entry_date=bill.bill_date,
            memo=f'Vendor bill {bill.bill_no or bill.pk}',
            source_type='vendor_bill',
            source_id=bill.pk,
            user=user or bill.created_by,
            lines=[
                _line_tuple(exp_code, amount, 0, bill.description or 'Purchase', **refs),
                _line_tuple(AP, 0, amount, 'Accounts payable', **refs),
            ],
        )
        if not bill.bill_no:
            bill.bill_no = f'VB-{bill.pk:06d}'
            bill.save(update_fields=['bill_no'])
        return entry

    @staticmethod
    @transaction.atomic
    def post_vendor_payment(payment, user=None):
        if not payment or payment.status != 'COMPLETED':
            return None
        amount = _dec(payment.amount)
        if amount <= 0:
            return None
        existing = AccountingService.find_posted(payment.tenant, 'vendor_payment', payment.pk, lock=True)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        if payment.bill_id:
            from .models import VendorBill as VB
            bill = VB.objects.select_for_update().get(pk=payment.bill_id)
            remaining = _dec(bill.amount) - _dec(bill.amount_paid)
            if amount > remaining:
                raise ValueError(
                    f'Payment {amount} exceeds bill balance due {remaining}.'
                )
        refs = {
            'vendor_id': payment.vendor_id,
            'bank_account_id': payment.bank_account_id,
        }
        cash_code, bank_id = AccountingService.cash_or_bank_code(
            payment.payment_method,
            getattr(payment, 'bank_account', None),
            tenant=payment.tenant,
        )
        refs['bank_account_id'] = refs.get('bank_account_id') or bank_id
        entry = AccountingService.post_entry(
            payment.tenant,
            entry_date=payment.payment_date,
            memo=f'Vendor payment {payment.payment_no or payment.pk}',
            source_type='vendor_payment',
            source_id=payment.pk,
            user=user or payment.created_by,
            lines=[
                _line_tuple(AP, amount, 0, 'Accounts payable', **refs),
                _line_tuple(cash_code, 0, amount, 'Cash/bank paid', **refs),
            ],
        )
        if payment.bill_id:
            bill = payment.bill
            bill.amount_paid = _dec(bill.amount_paid) + amount
            if bill.amount_paid >= bill.amount:
                bill.status = 'PAID'
            elif bill.amount_paid > 0:
                bill.status = 'PARTIAL'
            bill.save(update_fields=['amount_paid', 'status', 'updated_at'])
        if not payment.payment_no:
            payment.payment_no = f'VP-{payment.pk:06d}'
            payment.save(update_fields=['payment_no'])
        return entry

    @staticmethod
    @transaction.atomic
    def post_transfer(transfer, user=None):
        if not transfer or transfer.status != 'POSTED':
            return None
        amount = _dec(transfer.amount)
        if amount <= 0:
            return None
        if transfer.from_account_id == transfer.to_account_id:
            raise ValueError('Transfer from and to accounts must differ.')
        existing = AccountingService.find_posted(transfer.tenant, 'transfer', transfer.pk, lock=True)
        if existing and not AccountingService.is_reversed(existing):
            return existing
        return AccountingService.post_entry(
            transfer.tenant,
            entry_date=transfer.transfer_date,
            memo=transfer.memo or f'Transfer {transfer.pk}',
            source_type='transfer',
            source_id=transfer.pk,
            user=user or transfer.created_by,
            lines=[
                (
                    transfer.to_account.code,
                    amount,
                    Decimal('0.00'),
                    'Transfer in',
                    {
                        'bank_account_id': transfer.to_bank_id,
                    },
                ),
                (
                    transfer.from_account.code,
                    Decimal('0.00'),
                    amount,
                    'Transfer out',
                    {
                        'bank_account_id': transfer.from_bank_id,
                    },
                ),
            ],
        )

    @staticmethod
    def post_opening_balances(tenant, lines, *, entry_date=None, user=None, memo='Opening balances'):
        """
        lines: list of (account_code, debit, credit, description)
        Must balance. Uses source_type='opening'.
        """
        existing = JournalEntry.objects.filter(
            tenant=tenant, source_type='opening', status='POSTED'
        ).exclude(reversals__status='POSTED').first()
        if existing:
            raise ValueError('Opening balances already posted. Reverse first to re-enter.')
        # Reject empty input before post_entry (which returns None for zero lines)
        _, total_dr, total_cr = AccountingService._validate_lines(lines)
        if total_dr == 0 and total_cr == 0:
            raise ValueError('Provide at least one debit and one credit line.')
        return AccountingService.post_entry(
            tenant,
            entry_date=entry_date or timezone.localdate(),
            memo=memo,
            source_type='opening',
            source_id=0,
            lines=lines,
            user=user,
        )
