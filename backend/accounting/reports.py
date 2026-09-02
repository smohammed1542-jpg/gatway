"""Accounting report helpers — all amounts as Decimal, sourced from posted journals."""

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from .chart import AP, AR, BANK, CASH, CUSTOMER_ADVANCES
from .models import Account, JournalEntry, JournalLine
from .services import AccountingService, _dec


ASSET_TYPES = ('ASSET',)
LIABILITY_TYPES = ('LIABILITY',)
EQUITY_TYPES = ('EQUITY',)
REVENUE_TYPES = ('REVENUE',)
EXPENSE_TYPES = ('EXPENSE',)


def _posted_lines(tenant, *, start=None, end=None, as_of=None, account_codes=None):
    # Include REVERSED originals so they net with their POSTED reversal lines.
    # Excluding REVERSED while keeping the reversal leaves a wrong opposite balance.
    qs = JournalLine.objects.filter(
        journal_entry__tenant=tenant,
        journal_entry__status__in=('POSTED', 'REVERSED'),
    ).select_related('account', 'journal_entry', 'customer', 'vendor', 'booking')
    if as_of:
        qs = qs.filter(journal_entry__entry_date__lte=as_of)
    if start:
        qs = qs.filter(journal_entry__entry_date__gte=start)
    if end:
        qs = qs.filter(journal_entry__entry_date__lte=end)
    if account_codes:
        qs = qs.filter(account__code__in=account_codes)
    return qs


def account_balance(tenant, account_code, *, as_of=None):
    """Natural balance: assets/expenses debit-normal; others credit-normal."""
    AccountingService.ensure_chart(tenant)
    agg = _posted_lines(tenant, as_of=as_of, account_codes=[account_code]).aggregate(
        dr=Sum('debit'), cr=Sum('credit')
    )
    dr = _dec(agg['dr'])
    cr = _dec(agg['cr'])
    try:
        acct = Account.objects.get(tenant=tenant, code=account_code)
        if acct.account_type in ('ASSET', 'EXPENSE'):
            return dr - cr
        return cr - dr
    except Account.DoesNotExist:
        return dr - cr


def trial_balance(tenant, *, as_of=None, start=None, end=None):
    AccountingService.ensure_chart(tenant)
    lines = _posted_lines(tenant, as_of=as_of, start=start, end=end)
    rows_qs = (
        lines.values('account__code', 'account__name', 'account__account_type')
        .annotate(debit=Sum('debit'), credit=Sum('credit'))
        .order_by('account__code')
    )
    rows = []
    total_dr = Decimal('0.00')
    total_cr = Decimal('0.00')
    for row in rows_qs:
        debit = _dec(row['debit'])
        credit = _dec(row['credit'])
        total_dr += debit
        total_cr += credit
        rows.append({
            'code': row['account__code'],
            'name': row['account__name'],
            'account_type': row['account__account_type'],
            'debit': debit,
            'credit': credit,
            'balance': debit - credit,
        })
    return {
        'as_of': as_of,
        'start': start,
        'end': end,
        'total_debit': total_dr,
        'total_credit': total_cr,
        'balanced': total_dr == total_cr,
        'rows': rows,
    }


def general_ledger(
    tenant,
    *,
    account_code=None,
    start=None,
    end=None,
    customer_id=None,
    vendor_id=None,
    booking_id=None,
    cost_center_id=None,
    limit=2000,
):
    AccountingService.ensure_chart(tenant)
    opening = Decimal('0.00')
    if account_code and start:
        opening = account_balance(tenant, account_code, as_of=start - timedelta(days=1) if isinstance(start, date) else None)
        # Better: sum before start
        pre = _posted_lines(tenant, end=(start - timedelta(days=1)), account_codes=[account_code]).aggregate(
            dr=Sum('debit'), cr=Sum('credit')
        )
        acct = Account.objects.filter(tenant=tenant, code=account_code).first()
        dr, cr = _dec(pre['dr']), _dec(pre['cr'])
        if acct and acct.account_type in ('ASSET', 'EXPENSE'):
            opening = dr - cr
        else:
            opening = cr - dr

    qs = _posted_lines(tenant, start=start, end=end)
    if account_code:
        qs = qs.filter(account__code=account_code)
    if customer_id:
        qs = qs.filter(customer_id=customer_id)
    if vendor_id:
        qs = qs.filter(vendor_id=vendor_id)
    if booking_id:
        qs = qs.filter(booking_id=booking_id)
    if cost_center_id:
        qs = qs.filter(cost_center_id=cost_center_id)
    qs = qs.order_by('journal_entry__entry_date', 'journal_entry_id', 'id')

    running = opening
    rows = []
    for line in qs[:limit]:
        acct_type = line.account.account_type
        if acct_type in ('ASSET', 'EXPENSE'):
            running = running + line.debit - line.credit
        else:
            running = running + line.credit - line.debit
        rows.append({
            'entry_no': line.journal_entry.entry_no,
            'entry_date': line.journal_entry.entry_date,
            'account_code': line.account.code,
            'account_name': line.account.name,
            'memo': line.journal_entry.memo,
            'description': line.description,
            'reference': f'{line.journal_entry.source_type}:{line.journal_entry.source_id or ""}',
            'debit': line.debit,
            'credit': line.credit,
            'balance': running,
            'customer_id': line.customer_id,
            'vendor_id': line.vendor_id,
            'booking_id': line.booking_id,
        })
    return {
        'account': account_code,
        'opening_balance': opening,
        'closing_balance': running if rows else opening,
        'rows': rows,
    }


def party_ledger(tenant, *, customer_id=None, vendor_id=None, start=None, end=None):
    """Customer or vendor ledger with running balance (debit increases receivable / payable)."""
    if not customer_id and not vendor_id:
        return {'opening_balance': Decimal('0.00'), 'rows': [], 'closing_balance': Decimal('0.00')}

    codes = [AR, CUSTOMER_ADVANCES] if customer_id else [AP]
    qs = _posted_lines(tenant, start=start, end=end, account_codes=codes)
    if customer_id:
        qs = qs.filter(customer_id=customer_id)
    else:
        qs = qs.filter(vendor_id=vendor_id)

    # Opening
    opening = Decimal('0.00')
    if start:
        pre = _posted_lines(tenant, end=start - timedelta(days=1), account_codes=codes)
        if customer_id:
            pre = pre.filter(customer_id=customer_id)
        else:
            pre = pre.filter(vendor_id=vendor_id)
        agg = pre.aggregate(dr=Sum('debit'), cr=Sum('credit'))
        # Customer: debit AR increases owed; credit reduces. Advances credit increases liability.
        opening = _dec(agg['dr']) - _dec(agg['cr'])

    qs = qs.order_by('journal_entry__entry_date', 'journal_entry_id', 'id')
    running = opening
    rows = []
    for line in qs:
        running = running + line.debit - line.credit
        rows.append({
            'date': line.journal_entry.entry_date,
            'entry_no': line.journal_entry.entry_no,
            'reference': f'{line.journal_entry.source_type}:{line.journal_entry.source_id or ""}',
            'description': line.description or line.journal_entry.memo,
            'debit': line.debit,
            'credit': line.credit,
            'balance': running,
            'account_code': line.account.code,
            'booking_id': line.booking_id,
        })
    return {
        'customer_id': customer_id,
        'vendor_id': vendor_id,
        'opening_balance': opening,
        'closing_balance': running if rows else opening,
        'rows': rows,
    }


def cash_book(tenant, *, start=None, end=None, account_code=CASH):
    gl = general_ledger(tenant, account_code=account_code, start=start, end=end)
    rows = []
    for r in gl['rows']:
        rows.append({
            'date': r['entry_date'],
            'reference': r['reference'],
            'description': r['description'] or r['memo'],
            'received': r['debit'],
            'paid': r['credit'],
            'balance': r['balance'],
            'entry_no': r['entry_no'],
        })
    return {
        'account': account_code,
        'opening_balance': gl['opening_balance'],
        'closing_balance': gl['closing_balance'],
        'rows': rows,
    }


def bank_book(tenant, *, bank_account_id=None, start=None, end=None):
    qs = _posted_lines(tenant, start=start, end=end, account_codes=[BANK])
    if bank_account_id:
        qs = qs.filter(bank_account_id=bank_account_id)
    opening = Decimal('0.00')
    if start:
        pre = _posted_lines(tenant, end=start - timedelta(days=1), account_codes=[BANK])
        if bank_account_id:
            pre = pre.filter(bank_account_id=bank_account_id)
        agg = pre.aggregate(dr=Sum('debit'), cr=Sum('credit'))
        opening = _dec(agg['dr']) - _dec(agg['cr'])
    qs = qs.order_by('journal_entry__entry_date', 'journal_entry_id', 'id')
    running = opening
    rows = []
    for line in qs:
        running = running + line.debit - line.credit
        rows.append({
            'date': line.journal_entry.entry_date,
            'entry_no': line.journal_entry.entry_no,
            'reference': f'{line.journal_entry.source_type}:{line.journal_entry.source_id or ""}',
            'description': line.description or line.journal_entry.memo,
            'deposit': line.debit,
            'withdrawal': line.credit,
            'balance': running,
        })
    return {
        'bank_account_id': bank_account_id,
        'opening_balance': opening,
        'closing_balance': running if rows else opening,
        'rows': rows,
    }


def aging_receivable(tenant, *, as_of=None, customer_id=None):
    """
    Booking/stay-wise AR outstanding derived from posted AR journal lines.
    Operational booking.remaining_balance is intentionally not used here.
    """
    from collections import defaultdict

    from bookings.models import Booking
    from guesthouse.models import StayBooking

    as_of = as_of or timezone.localdate()
    lines = _posted_lines(tenant, as_of=as_of, account_codes=[AR])
    if customer_id:
        lines = lines.filter(customer_id=customer_id)

    groups = defaultdict(lambda: {
        'debit': Decimal('0.00'),
        'credit': Decimal('0.00'),
        'customer_id': None,
        'booking_id': None,
        'stay_id': None,
    })
    for line in lines.iterator():
        if line.booking_id:
            key = ('booking', line.booking_id)
        elif line.stay_id:
            key = ('stay', line.stay_id)
        elif line.customer_id:
            key = ('customer', line.customer_id)
        else:
            key = ('orphan', line.journal_entry_id)
        g = groups[key]
        g['debit'] += _dec(line.debit)
        g['credit'] += _dec(line.credit)
        g['customer_id'] = g['customer_id'] or line.customer_id
        g['booking_id'] = g['booking_id'] or line.booking_id
        g['stay_id'] = g['stay_id'] or line.stay_id

    booking_ids = [k[1] for k in groups if k[0] == 'booking']
    stay_ids = [k[1] for k in groups if k[0] == 'stay']
    bookings = {
        b.pk: b
        for b in Booking.objects.filter(pk__in=booking_ids).select_related('customer')
    }
    stays = {
        s.pk: s
        for s in StayBooking.objects.filter(pk__in=stay_ids).select_related('customer')
    }

    buckets = {
        'current': Decimal('0.00'),
        '1_30': Decimal('0.00'),
        '31_60': Decimal('0.00'),
        '61_90': Decimal('0.00'),
        '90_plus': Decimal('0.00'),
    }
    rows = []
    for key, g in groups.items():
        amt = _dec(g['debit'] - g['credit'])
        if amt <= 0:
            continue
        due = as_of
        customer_name = ''
        booking_ref = ''
        status = 'OPEN'
        booking_id = g['booking_id']
        stay_id = g['stay_id']
        cust_id = g['customer_id']

        if key[0] == 'booking' and key[1] in bookings:
            b = bookings[key[1]]
            due = b.event_date or as_of
            cust_id = b.customer_id
            customer_name = b.customer.display_name if b.customer_id else ''
            booking_ref = b.booking_id or f'BK-{b.pk}'
            status = b.payment_status
        elif key[0] == 'stay' and key[1] in stays:
            s = stays[key[1]]
            due = s.check_out or s.check_in or as_of
            cust_id = s.customer_id
            customer_name = s.customer.display_name if s.customer_id else ''
            booking_ref = s.booking_ref or f'STAY-{s.pk}'
            status = s.payment_status
            stay_id = s.pk
        elif cust_id:
            from customers.models import Customer
            c = Customer.objects.filter(pk=cust_id).first()
            customer_name = c.display_name if c else ''
            booking_ref = 'Unallocated'

        days = (as_of - due).days if due else 0
        if days <= 0:
            bucket = 'current'
        elif days <= 30:
            bucket = '1_30'
        elif days <= 60:
            bucket = '31_60'
        elif days <= 90:
            bucket = '61_90'
        else:
            bucket = '90_plus'
        buckets[bucket] += amt
        rows.append({
            'customer_id': cust_id,
            'customer_name': customer_name,
            'booking_id': booking_id,
            'stay_id': stay_id,
            'booking_ref': booking_ref,
            'due_date': due,
            'days_overdue': max(0, days),
            'amount': amt,
            'bucket': bucket,
            'status': status,
            'source': key[0],
        })

    rows.sort(key=lambda r: (r['due_date'] or as_of, r['booking_ref'] or ''))
    total = sum(buckets.values(), Decimal('0.00'))
    return {
        'as_of': as_of,
        'total': total,
        'buckets': buckets,
        'rows': rows,
    }


def aging_payable(tenant, *, as_of=None, vendor_id=None):
    from .models import VendorBill

    as_of = as_of or timezone.localdate()
    qs = VendorBill.objects.filter(tenant=tenant).exclude(status='CANCELLED').exclude(status='PAID')
    if vendor_id:
        qs = qs.filter(vendor_id=vendor_id)

    buckets = {
        'current': Decimal('0.00'),
        '1_30': Decimal('0.00'),
        '31_60': Decimal('0.00'),
        '61_90': Decimal('0.00'),
        '90_plus': Decimal('0.00'),
    }
    rows = []
    for bill in qs.select_related('vendor'):
        due = bill.due_date or bill.bill_date
        days = (as_of - due).days
        amt = _dec(bill.amount) - _dec(bill.amount_paid)
        if amt <= 0:
            continue
        if days <= 0:
            bucket = 'current'
        elif days <= 30:
            bucket = '1_30'
        elif days <= 60:
            bucket = '31_60'
        elif days <= 90:
            bucket = '61_90'
        else:
            bucket = '90_plus'
        buckets[bucket] += amt
        rows.append({
            'vendor_id': bill.vendor_id,
            'vendor_name': bill.vendor.name if bill.vendor_id else '',
            'bill_id': bill.pk,
            'bill_no': bill.bill_no,
            'due_date': due,
            'days_overdue': max(0, days),
            'amount': amt,
            'bucket': bucket,
            'status': bill.status,
        })
    total = sum(buckets.values(), Decimal('0.00'))
    return {
        'as_of': as_of,
        'total': total,
        'buckets': buckets,
        'rows': rows,
    }


def profit_and_loss(tenant, *, start=None, end=None):
    AccountingService.ensure_chart(tenant)
    lines = _posted_lines(tenant, start=start, end=end)
    rev = (
        lines.filter(account__account_type='REVENUE')
        .values('account__code', 'account__name')
        .annotate(debit=Sum('debit'), credit=Sum('credit'))
        .order_by('account__code')
    )
    exp = (
        lines.filter(account__account_type='EXPENSE')
        .values('account__code', 'account__name')
        .annotate(debit=Sum('debit'), credit=Sum('credit'))
        .order_by('account__code')
    )
    revenue_rows = []
    total_revenue = Decimal('0.00')
    for r in rev:
        # Discount Allowed (4950) is contra-revenue (debit normal within REVENUE type)
        net = _dec(r['credit']) - _dec(r['debit'])
        revenue_rows.append({
            'code': r['account__code'],
            'name': r['account__name'],
            'amount': net,
        })
        total_revenue += net

    expense_rows = []
    total_expenses = Decimal('0.00')
    for r in exp:
        net = _dec(r['debit']) - _dec(r['credit'])
        expense_rows.append({
            'code': r['account__code'],
            'name': r['account__name'],
            'amount': net,
        })
        total_expenses += net

    return {
        'start': start,
        'end': end,
        'revenue': revenue_rows,
        'expenses': expense_rows,
        'total_revenue': total_revenue,
        'total_expenses': total_expenses,
        'net_profit': total_revenue - total_expenses,
    }


def balance_sheet(tenant, *, as_of=None):
    AccountingService.ensure_chart(tenant)
    as_of = as_of or timezone.localdate()
    # Year start for current period P&L
    year_start = date(as_of.year, 1, 1)
    pnl = profit_and_loss(tenant, start=year_start, end=as_of)

    def section(atypes):
        rows = []
        total = Decimal('0.00')
        accounts = Account.objects.filter(tenant=tenant, account_type__in=atypes, is_active=True).order_by('code')
        for acct in accounts:
            bal = account_balance(tenant, acct.code, as_of=as_of)
            if bal == 0:
                continue
            rows.append({'code': acct.code, 'name': acct.name, 'amount': bal})
            total += bal
        return rows, total

    assets, total_assets = section(['ASSET'])
    liabilities, total_liabilities = section(['LIABILITY'])
    equity_rows, total_equity = section(['EQUITY'])
    # Add current period net profit into equity
    equity_rows.append({
        'code': 'NP',
        'name': 'Current Period Profit/Loss',
        'amount': pnl['net_profit'],
    })
    total_equity += pnl['net_profit']

    return {
        'as_of': as_of,
        'assets': assets,
        'liabilities': liabilities,
        'equity': equity_rows,
        'total_assets': total_assets,
        'total_liabilities': total_liabilities,
        'total_equity': total_equity,
        'balanced': total_assets == (total_liabilities + total_equity),
        'difference': total_assets - (total_liabilities + total_equity),
    }


def cash_flow(tenant, *, start=None, end=None):
    """Cash flow from cash + bank movements. Transfers are excluded from gross in/out."""
    cash_codes = [CASH, BANK]
    # Opening = balance before the period. If no start, opening is zero (all activity is in-period).
    opening_cash = Decimal('0.00')
    if start:
        day_before = start - timedelta(days=1)
        for code in cash_codes:
            opening_cash += account_balance(tenant, code, as_of=day_before)

    lines = _posted_lines(tenant, start=start, end=end, account_codes=cash_codes)
    inflows = Decimal('0.00')
    outflows = Decimal('0.00')
    operating_in = Decimal('0.00')
    operating_out = Decimal('0.00')
    financing_in = Decimal('0.00')
    financing_out = Decimal('0.00')
    investing_in = Decimal('0.00')
    investing_out = Decimal('0.00')
    transfer_in = Decimal('0.00')
    transfer_out = Decimal('0.00')

    for line in lines.select_related('journal_entry'):
        src = line.journal_entry.source_type
        # Internal cash↔bank transfers must not inflate gross cash in/out.
        if src == 'transfer':
            if line.debit > 0:
                transfer_in += line.debit
            if line.credit > 0:
                transfer_out += line.credit
            continue
        if line.debit > 0:
            inflows += line.debit
            if src in ('payment', 'stay_payment', 'expense', 'gh_expense',
                       'vendor_payment'):
                operating_in += line.debit
            elif src in ('opening', 'manual', 'adjustment'):
                financing_in += line.debit
            else:
                operating_in += line.debit
        if line.credit > 0:
            outflows += line.credit
            if src in ('expense', 'gh_expense', 'vendor_payment', 'payment', 'stay_payment'):
                operating_out += line.credit
            elif src in ('opening', 'manual', 'adjustment'):
                financing_out += line.credit
            else:
                operating_out += line.credit

    # Closing cash+bank = opening + external net (transfers net to zero across both accounts)
    closing = opening_cash + inflows - outflows
    return {
        'start': start,
        'end': end,
        'opening_cash': opening_cash,
        'cash_inflows': inflows,
        'cash_outflows': outflows,
        'net_cash_movement': inflows - outflows,
        'closing_cash': closing,
        'transfers': {
            'inflows': transfer_in,
            'outflows': transfer_out,
            'net': transfer_in - transfer_out,
        },
        'operating': {
            'inflows': operating_in,
            'outflows': operating_out,
            'net': operating_in - operating_out,
        },
        'investing': {
            'inflows': investing_in,
            'outflows': investing_out,
            'net': investing_in - investing_out,
        },
        'financing': {
            'inflows': financing_in,
            'outflows': financing_out,
            'net': financing_in - financing_out,
        },
    }


def accounting_dashboard(tenant):
    today = timezone.localdate()
    month_start = date(today.year, today.month, 1)
    pnl_today = profit_and_loss(tenant, start=today, end=today)
    pnl_month = profit_and_loss(tenant, start=month_start, end=today)
    ar = aging_receivable(tenant, as_of=today)
    ap = aging_payable(tenant, as_of=today)

    # Today's payments / expenses from journals
    pay_lines = _posted_lines(tenant, start=today, end=today).filter(
        journal_entry__source_type__in=('payment', 'stay_payment'),
        account__code__in=[CASH, BANK],
        debit__gt=0,
    )
    today_payments = _dec(pay_lines.aggregate(s=Sum('debit'))['s'])
    exp_lines = _posted_lines(tenant, start=today, end=today).filter(
        journal_entry__source_type__in=('expense', 'gh_expense'),
        account__account_type='EXPENSE',
        debit__gt=0,
    )
    today_expenses = _dec(exp_lines.aggregate(s=Sum('debit'))['s'])

    # Monthly series for charts (last 6 months)
    revenue_by_month = []
    expense_by_month = []
    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        start_m = date(y, m, 1)
        if m == 12:
            end_m = date(y, 12, 31)
        else:
            end_m = date(y, m + 1, 1) - timedelta(days=1)
        if end_m > today:
            end_m = today
        p = profit_and_loss(tenant, start=start_m, end=end_m)
        label = start_m.strftime('%b %Y')
        revenue_by_month.append({'month': label, 'amount': p['total_revenue']})
        expense_by_month.append({'month': label, 'amount': p['total_expenses']})

    return {
        'today_revenue': pnl_today['total_revenue'],
        'today_payments': today_payments,
        'today_expenses': today_expenses,
        'total_receivables': ar['total'],
        'total_payables': ap['total'],
        'cash_balance': account_balance(tenant, CASH),
        'bank_balance': account_balance(tenant, BANK),
        'monthly_revenue': pnl_month['total_revenue'],
        'monthly_expenses': pnl_month['total_expenses'],
        'net_profit': pnl_month['net_profit'],
        'outstanding_customer': ar['total'],
        'outstanding_vendor': ap['total'],
        'receivables_aging': ar['buckets'],
        'charts': {
            'revenue_by_month': revenue_by_month,
            'expense_by_month': expense_by_month,
        },
    }


def integrity_check(tenant):
    issues = []
    # Unbalanced journals (include REVERSED originals — each entry must still balance)
    for entry in JournalEntry.objects.filter(
        tenant=tenant, status__in=('POSTED', 'REVERSED')
    ).prefetch_related('lines'):
        dr = sum((l.debit for l in entry.lines.all()), Decimal('0'))
        cr = sum((l.credit for l in entry.lines.all()), Decimal('0'))
        if dr != cr:
            issues.append({
                'type': 'unbalanced_entry',
                'entry_no': entry.entry_no,
                'entry_id': entry.pk,
                'debit': dr,
                'credit': cr,
            })
    # Orphan lines (account missing — PROTECT should prevent)
    orphan = JournalLine.objects.filter(
        journal_entry__tenant=tenant,
        account__isnull=True,
    ).count()
    if orphan:
        issues.append({'type': 'orphaned_lines', 'count': orphan})

    # Duplicate posted sources
    from django.db.models import Count
    dupes = (
        JournalEntry.objects.filter(tenant=tenant, status='POSTED', reversed_entry__isnull=True)
        .exclude(source_type='reversal')
        .exclude(source_type='manual')
        .values('source_type', 'source_id')
        .annotate(c=Count('id'))
        .filter(c__gt=1)
    )
    for d in dupes:
        posted = JournalEntry.objects.filter(
            tenant=tenant,
            source_type=d['source_type'],
            source_id=d['source_id'],
            status='POSTED',
        )
        active = [e for e in posted if not AccountingService.is_reversed(e)]
        if len(active) > 1:
            issues.append({
                'type': 'duplicate_source',
                'source_type': d['source_type'],
                'source_id': d['source_id'],
                'count': len(active),
            })

    tb = trial_balance(tenant)
    if not tb['balanced']:
        issues.append({
            'type': 'trial_balance_mismatch',
            'total_debit': tb['total_debit'],
            'total_credit': tb['total_credit'],
        })

    bs = balance_sheet(tenant)
    if not bs['balanced']:
        issues.append({
            'type': 'balance_sheet_mismatch',
            'difference': bs['difference'],
        })

    return {
        'ok': len(issues) == 0,
        'issue_count': len(issues),
        'issues': issues,
    }
