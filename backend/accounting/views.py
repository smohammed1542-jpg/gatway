from datetime import datetime
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.mixins import TenantAssignMixin, TenantQuerysetMixin
from core.permissions import IsAdmin, IsAdminOrManager, IsAdminOrManagerOrReadOnly, IsTenantOwner

from .models import (
    Account,
    AuditLog,
    BankAccount,
    BankReconciliation,
    BankTransfer,
    CostCenter,
    FiscalPeriod,
    Invoice,
    JournalEntry,
    JournalLine,
    Tax,
    Vendor,
    VendorBill,
    VendorPayment,
)
from . import reports
from . import sequences
from .serializers import (
    AccountSerializer,
    AuditLogSerializer,
    BankAccountSerializer,
    BankReconciliationSerializer,
    BankTransferSerializer,
    CostCenterSerializer,
    FiscalPeriodSerializer,
    InvoiceSerializer,
    JournalEntryCreateSerializer,
    JournalEntrySerializer,
    OpeningBalanceSerializer,
    TaxSerializer,
    VendorBillSerializer,
    VendorPaymentSerializer,
    VendorSerializer,
)
from .services import AccountingService, _dec


def _parse_date(value):
    if not value:
        return None
    if hasattr(value, 'year'):
        return value
    return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()


def _decimalize(obj):
    """Recursively convert Decimals to strings for JSON safety."""
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _decimalize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimalize(v) for v in obj]
    return obj


class AccountViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = Account.objects.all().order_by('code')
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['account_type', 'is_active', 'is_system']
    search_fields = ['code', 'name']
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self.request.user, 'tenant', None)
        if tenant:
            AccountingService.ensure_chart(tenant)
        return qs

    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        AccountingService.ensure_chart(tenant)
        serializer.save(tenant=tenant, is_system=False)

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.is_system:
            # Allow name/description/active tweaks but not code/type change for system
            data = serializer.validated_data
            if 'code' in data and data['code'] != instance.code:
                raise serializers_error('System account code cannot be changed.')
            if 'account_type' in data and data['account_type'] != instance.account_type:
                raise serializers_error('System account type cannot be changed.')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Accounts cannot be deleted. Deactivate instead.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdminOrManager])
    def deactivate(self, request, pk=None):
        account = self.get_object()
        if account.is_system and account.journal_lines.exists():
            # Still allow deactivate of unused; block only if we want — plan says deactivate ok
            pass
        account.is_active = False
        account.save(update_fields=['is_active', 'updated_at'])
        AuditLog.record(
            account.tenant,
            action='DEACTIVATE',
            entity_type='account',
            entity_id=account.pk,
            message=account.code,
            actor=request.user,
        )
        return Response(AccountSerializer(account).data)


def serializers_error(msg):
    from rest_framework.exceptions import ValidationError
    raise ValidationError({'detail': msg})


class TaxViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = Tax.objects.all().order_by('name')
    serializer_class = TaxSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class CostCenterViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = CostCenter.objects.all().order_by('code')
    serializer_class = CostCenterSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['kind', 'is_active']
    search_fields = ['code', 'name']
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class FiscalPeriodViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = FiscalPeriod.objects.all()
    serializer_class = FiscalPeriodSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdmin])
    def close(self, request, pk=None):
        period = self.get_object()
        period.is_closed = True
        period.save(update_fields=['is_closed', 'updated_at'])
        AuditLog.record(
            period.tenant, action='CLOSE', entity_type='fiscal_period',
            entity_id=period.pk, message=period.name, actor=request.user,
        )
        return Response(FiscalPeriodSerializer(period).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdmin])
    def reopen(self, request, pk=None):
        period = self.get_object()
        period.is_closed = False
        period.save(update_fields=['is_closed', 'updated_at'])
        AuditLog.record(
            period.tenant, action='REOPEN', entity_type='fiscal_period',
            entity_id=period.pk, message=period.name, actor=request.user,
        )
        return Response(FiscalPeriodSerializer(period).data)


class JournalEntryViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = JournalEntry.objects.all().prefetch_related('lines__account')
    serializer_class = JournalEntrySerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'source_type', 'entry_date']
    search_fields = ['entry_no', 'memo']
    ordering_fields = ['entry_date', 'id']
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        return super().get_queryset().select_related('created_by', 'reversed_entry')

    def create(self, request, *args, **kwargs):
        ser = JournalEntryCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        tenant = request.user.tenant
        AccountingService.ensure_chart(tenant)

        lines = []
        for line in data['lines']:
            code = line.get('account_code')
            if not code and line.get('account'):
                acct = Account.objects.filter(tenant=tenant, pk=line['account']).first()
                if not acct:
                    return Response({'detail': 'Invalid account.'}, status=400)
                code = acct.code
            if not code:
                return Response({'detail': 'account_code required on each line.'}, status=400)
            refs = {}
            if line.get('customer'):
                refs['customer_id'] = line['customer']
            if line.get('vendor'):
                refs['vendor_id'] = line['vendor']
            if line.get('booking'):
                refs['booking_id'] = line['booking']
            if line.get('stay'):
                refs['stay_id'] = line['stay']
            if line.get('bank_account'):
                refs['bank_account_id'] = line['bank_account']
            lines.append((
                code,
                line.get('debit') or 0,
                line.get('credit') or 0,
                line.get('description') or '',
                refs,
            ))
        try:
            if data.get('post_immediately'):
                entry = AccountingService.post_entry(
                    tenant,
                    entry_date=data['entry_date'],
                    memo=data.get('memo') or '',
                    source_type=data.get('source_type') or 'manual',
                    source_id=None,
                    lines=lines,
                    user=request.user,
                    status='POSTED',
                )
            else:
                entry = AccountingService.create_draft(
                    tenant,
                    entry_date=data['entry_date'],
                    memo=data.get('memo') or '',
                    lines=lines,
                    user=request.user,
                    source_type=data.get('source_type') or 'manual',
                )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)

        return Response(
            JournalEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdminOrManager])
    def post_entry(self, request, pk=None):
        entry = self.get_object()
        try:
            entry = AccountingService.post_draft(entry, user=request.user)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(JournalEntrySerializer(entry).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsAdmin])
    def reverse(self, request, pk=None):
        entry = self.get_object()
        reason = request.data.get('reason', '')
        try:
            reversal = AccountingService.reverse_entry(
                entry, user=request.user, reason=reason,
                memo=request.data.get('memo'),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        if not reversal:
            return Response({'detail': 'Entry cannot be reversed.'}, status=400)
        return Response(JournalEntrySerializer(reversal).data)

    @action(detail=False, methods=['get'], url_path='trial_balance')
    def trial_balance(self, request):
        tenant = request.user.tenant
        as_of = _parse_date(request.query_params.get('as_of'))
        start = _parse_date(request.query_params.get('start'))
        end = _parse_date(request.query_params.get('end'))
        data = reports.trial_balance(tenant, as_of=as_of, start=start, end=end)
        return Response(_decimalize(data))

    @action(detail=False, methods=['get'], url_path='general_ledger')
    def general_ledger(self, request):
        tenant = request.user.tenant
        data = reports.general_ledger(
            tenant,
            account_code=request.query_params.get('account'),
            start=_parse_date(request.query_params.get('start')),
            end=_parse_date(request.query_params.get('end')),
            customer_id=request.query_params.get('customer'),
            vendor_id=request.query_params.get('vendor'),
            booking_id=request.query_params.get('booking'),
        )
        return Response(_decimalize(data))

    @action(detail=False, methods=['get'], url_path='profit_and_loss')
    def profit_and_loss(self, request):
        tenant = request.user.tenant
        data = reports.profit_and_loss(
            tenant,
            start=_parse_date(request.query_params.get('start')),
            end=_parse_date(request.query_params.get('end')),
        )
        return Response(_decimalize(data))

    @action(detail=False, methods=['get'], url_path='balance_sheet')
    def balance_sheet(self, request):
        tenant = request.user.tenant
        data = reports.balance_sheet(
            tenant, as_of=_parse_date(request.query_params.get('as_of')),
        )
        return Response(_decimalize(data))

    @action(detail=False, methods=['get'], url_path='cash_flow')
    def cash_flow(self, request):
        tenant = request.user.tenant
        data = reports.cash_flow(
            tenant,
            start=_parse_date(request.query_params.get('start')),
            end=_parse_date(request.query_params.get('end')),
        )
        return Response(_decimalize(data))


class AuditLogViewSet(TenantQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all().select_related('actor')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['action', 'entity_type']
    search_fields = ['message', 'entity_type', 'reason']
    ordering_fields = ['created_at']


class VendorViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'phone', 'email']

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)

    def destroy(self, request, *args, **kwargs):
        vendor = self.get_object()
        vendor.is_active = False
        vendor.save(update_fields=['is_active', 'updated_at'])
        return Response(VendorSerializer(vendor).data)

    @action(detail=True, methods=['get'])
    def ledger(self, request, pk=None):
        vendor = self.get_object()
        data = reports.party_ledger(
            request.user.tenant,
            vendor_id=vendor.pk,
            start=_parse_date(request.query_params.get('start')),
            end=_parse_date(request.query_params.get('end')),
        )
        return Response(_decimalize(data))


class VendorBillViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = VendorBill.objects.all().select_related('vendor', 'expense_account')
    serializer_class = VendorBillSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManager, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['status', 'vendor']
    search_fields = ['bill_no', 'description']
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        import uuid
        from accounting import sequences as seq_mod
        bill = ser.save(
            tenant=request.user.tenant,
            created_by=request.user,
            status='POSTED',
            bill_no=f'TMP-{uuid.uuid4().hex[:12]}',
        )
        bill.bill_no = seq_mod.next_document_no(request.user.tenant, 'VB')
        bill.save(update_fields=['bill_no'])
        try:
            AccountingService.post_vendor_bill(bill, user=request.user)
        except ValueError as exc:
            bill.status = 'CANCELLED'
            bill.save(update_fields=['status'])
            return Response({'detail': str(exc)}, status=400)
        bill.refresh_from_db()
        return Response(VendorBillSerializer(bill).data, status=201)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        bill = self.get_object()
        if bill.status == 'CANCELLED':
            return Response({'detail': 'Already cancelled.'}, status=400)
        AccountingService.reverse_source(
            bill.tenant, 'vendor_bill', bill.pk, user=request.user, reason='Bill cancelled'
        )
        bill.status = 'CANCELLED'
        bill.save(update_fields=['status', 'updated_at'])
        return Response(VendorBillSerializer(bill).data)


class VendorPaymentViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = VendorPayment.objects.all().select_related('vendor', 'bill')
    serializer_class = VendorPaymentSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManager, IsTenantOwner]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'vendor', 'bill']
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        payment = ser.save(
            tenant=request.user.tenant,
            created_by=request.user,
            status='COMPLETED',
        )
        try:
            AccountingService.post_vendor_payment(payment, user=request.user)
        except ValueError as exc:
            payment.status = 'VOIDED'
            payment.save(update_fields=['status'])
            return Response({'detail': str(exc)}, status=400)
        payment.refresh_from_db()
        return Response(VendorPaymentSerializer(payment).data, status=201)


class BankAccountViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = BankAccount.objects.all().select_related('gl_account')
    serializer_class = BankAccountSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active', 'is_default']
    search_fields = ['bank_name', 'account_name']

    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        AccountingService.ensure_chart(tenant)
        instance = serializer.save(tenant=tenant)
        if instance.is_default:
            BankAccount.objects.filter(tenant=tenant).exclude(pk=instance.pk).update(is_default=False)

    def destroy(self, request, *args, **kwargs):
        ba = self.get_object()
        ba.is_active = False
        ba.save(update_fields=['is_active', 'updated_at'])
        return Response(BankAccountSerializer(ba).data)


class BankTransferViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = BankTransfer.objects.all().select_related('from_account', 'to_account')
    serializer_class = BankTransferSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManager, IsTenantOwner]
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        transfer = ser.save(
            tenant=request.user.tenant,
            created_by=request.user,
            status='POSTED',
        )
        try:
            AccountingService.post_transfer(transfer, user=request.user)
        except ValueError as exc:
            transfer.status = 'VOIDED'
            transfer.save(update_fields=['status'])
            return Response({'detail': str(exc)}, status=400)
        return Response(BankTransferSerializer(transfer).data, status=201)


class BankReconciliationViewSet(TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = BankReconciliation.objects.all().select_related('bank_account')
    serializer_class = BankReconciliationSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManager, IsTenantOwner]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'bank_account']

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        bank = ser.validated_data['bank_account']
        statement_date = ser.validated_data['statement_date']
        statement_balance = _dec(ser.validated_data['statement_balance'])
        book = reports.account_balance(
            request.user.tenant, bank.gl_account.code, as_of=statement_date
        )
        recon = ser.save(
            tenant=request.user.tenant,
            created_by=request.user,
            book_balance=book,
            difference=statement_balance - book,
            status='IN_PROGRESS',
        )
        return Response(BankReconciliationSerializer(recon).data, status=201)

    @action(detail=True, methods=['get'])
    def unreconciled(self, request, pk=None):
        recon = self.get_object()
        lines = JournalLine.objects.filter(
            journal_entry__tenant=request.user.tenant,
            journal_entry__status__in=('POSTED', 'REVERSED'),
            journal_entry__entry_date__lte=recon.statement_date,
            account_id=recon.bank_account.gl_account_id,
            reconciled=False,
        ).select_related('journal_entry', 'account').order_by('journal_entry__entry_date')
        if recon.bank_account_id:
            # Prefer lines tagged to this bank, but include untagged bank GL lines
            lines = lines.filter(
                models_Q_bank(recon.bank_account_id)
            )
        data = [
            {
                'id': l.pk,
                'entry_no': l.journal_entry.entry_no,
                'entry_date': l.journal_entry.entry_date,
                'description': l.description or l.journal_entry.memo,
                'debit': str(l.debit),
                'credit': str(l.credit),
            }
            for l in lines[:500]
        ]
        return Response(data)

    @action(detail=True, methods=['post'])
    def match(self, request, pk=None):
        recon = self.get_object()
        line_ids = request.data.get('line_ids') or []
        JournalLine.objects.filter(
            pk__in=line_ids,
            journal_entry__tenant=request.user.tenant,
        ).update(reconciled=True, reconciliation=recon)
        return Response({'matched': len(line_ids)})

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        recon = self.get_object()
        allow_adjustment = request.data.get('allow_adjustment', False)
        # Recalc difference
        book = reports.account_balance(
            request.user.tenant,
            recon.bank_account.gl_account.code,
            as_of=recon.statement_date,
        )
        recon.book_balance = book
        recon.difference = _dec(recon.statement_balance) - _dec(book)
        if recon.difference != 0 and not allow_adjustment:
            recon.save(update_fields=['book_balance', 'difference', 'updated_at'])
            return Response({
                'detail': 'Difference is non-zero. Record an adjustment or pass allow_adjustment=true.',
                'difference': str(recon.difference),
            }, status=400)
        if recon.difference != 0 and allow_adjustment:
            # Only ADMIN may force-complete with adjustment flag (permission already AdminOrManager;
            # tighten: require IsAdmin for adjustment)
            if getattr(request.user, 'role', None) not in ('ADMIN',) and not request.user.is_superuser:
                return Response({'detail': 'Only ADMIN may complete with a non-zero difference.'}, status=403)
        recon.status = 'COMPLETED'
        recon.completed_at = timezone.now()
        recon.save(update_fields=['book_balance', 'difference', 'status', 'completed_at', 'updated_at'])
        return Response(BankReconciliationSerializer(recon).data)


def models_Q_bank(bank_account_id):
    from django.db.models import Q
    return Q(bank_account_id=bank_account_id) | Q(bank_account__isnull=True)


class InvoiceViewSet(TenantQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Invoice.objects.all().select_related('customer', 'booking')
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['status', 'customer', 'booking']
    search_fields = ['invoice_no']


class ReportAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def get(self, request, report_name):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=400)
        AccountingService.ensure_chart(tenant)
        start = _parse_date(request.query_params.get('start'))
        end = _parse_date(request.query_params.get('end'))
        as_of = _parse_date(request.query_params.get('as_of'))
        handlers = {
            'trial_balance': lambda: reports.trial_balance(tenant, as_of=as_of, start=start, end=end),
            'profit_and_loss': lambda: reports.profit_and_loss(tenant, start=start, end=end),
            'balance_sheet': lambda: reports.balance_sheet(tenant, as_of=as_of),
            'cash_flow': lambda: reports.cash_flow(tenant, start=start, end=end),
            'general_ledger': lambda: reports.general_ledger(
                tenant,
                account_code=request.query_params.get('account'),
                start=start, end=end,
                customer_id=request.query_params.get('customer'),
                vendor_id=request.query_params.get('vendor'),
                booking_id=request.query_params.get('booking'),
                cost_center_id=request.query_params.get('cost_center'),
            ),
            'cash_book': lambda: reports.cash_book(
                tenant, start=start, end=end,
                account_code=request.query_params.get('account') or '1000',
            ),
            'bank_book': lambda: reports.bank_book(
                tenant,
                bank_account_id=request.query_params.get('bank_account'),
                start=start, end=end,
            ),
            'customer_ledger': lambda: reports.party_ledger(
                tenant,
                customer_id=request.query_params.get('customer'),
                start=start, end=end,
            ),
            'vendor_ledger': lambda: reports.party_ledger(
                tenant,
                vendor_id=request.query_params.get('vendor'),
                start=start, end=end,
            ),
            'receivables': lambda: reports.aging_receivable(
                tenant, as_of=as_of,
                customer_id=request.query_params.get('customer'),
            ),
            'payables': lambda: reports.aging_payable(
                tenant, as_of=as_of,
                vendor_id=request.query_params.get('vendor'),
            ),
            'dashboard': lambda: reports.accounting_dashboard(tenant),
            'integrity': lambda: reports.integrity_check(tenant),
        }
        if report_name not in handlers:
            return Response({'detail': f'Unknown report: {report_name}'}, status=404)
        return Response(_decimalize(handlers[report_name]()))


class OpeningBalanceAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=400)
        entry = (
            JournalEntry.objects.filter(tenant=tenant, source_type='opening', status='POSTED')
            .exclude(reversals__status='POSTED')
            .prefetch_related('lines__account')
            .first()
        )
        if not entry:
            return Response({'posted': False, 'entry': None})
        return Response({
            'posted': True,
            'entry': JournalEntrySerializer(entry).data,
        })

    def post(self, request):
        ser = OpeningBalanceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        tenant = request.user.tenant
        AccountingService.ensure_chart(tenant)
        lines = []
        for line in ser.validated_data['lines']:
            code = line.get('account_code')
            if not code and line.get('account'):
                acct = Account.objects.filter(tenant=tenant, pk=line['account']).first()
                code = acct.code if acct else None
            if not code:
                return Response({'detail': 'account_code required'}, status=400)
            lines.append((
                code,
                line.get('debit') or 0,
                line.get('credit') or 0,
                line.get('description') or '',
            ))
        try:
            entry = AccountingService.post_opening_balances(
                tenant,
                lines,
                entry_date=ser.validated_data.get('entry_date'),
                user=request.user,
                memo=ser.validated_data.get('memo') or 'Opening balances',
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        if entry is None:
            return Response(
                {'detail': 'Nothing to post — provide balanced debit and credit lines.'},
                status=400,
            )
        return Response(JournalEntrySerializer(entry).data, status=201)
