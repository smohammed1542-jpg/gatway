from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum

from core.mixins import TenantQuerysetMixin, TenantAssignMixin
from core.permissions import IsAdminOrManagerOrReadOnly, IsTenantOwner
from .models import Account, AuditLog, FiscalPeriod, JournalEntry, JournalLine, Tax
from .serializers import (
    AccountSerializer,
    AuditLogSerializer,
    FiscalPeriodSerializer,
    JournalEntrySerializer,
    TaxSerializer,
)
from .services import AccountingService


class AccountViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Account.objects.all().order_by('code')
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['account_type', 'is_active']
    search_fields = ['code', 'name']

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self.request.user, 'tenant', None)
        if tenant:
            AccountingService.ensure_chart(tenant)
        return qs


class TaxViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Tax.objects.all().order_by('name')
    serializer_class = TaxSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]


class FiscalPeriodViewSet(TenantQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = FiscalPeriod.objects.all()
    serializer_class = FiscalPeriodSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]


class JournalEntryViewSet(TenantQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = JournalEntry.objects.all().prefetch_related('lines__account')
    serializer_class = JournalEntrySerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'source_type', 'entry_date']
    search_fields = ['entry_no', 'memo']
    ordering_fields = ['entry_date', 'id']

    def get_queryset(self):
        return super().get_queryset().select_related('created_by', 'reversed_entry')

    @action(detail=False, methods=['get'], url_path='trial_balance')
    def trial_balance(self, request):
        tenant = getattr(request.user, 'tenant', None)
        if tenant:
            AccountingService.ensure_chart(tenant)
        as_of = request.query_params.get('as_of')
        lines = JournalLine.objects.filter(
            journal_entry__tenant=tenant,
            journal_entry__status='POSTED',
        )
        if as_of:
            lines = lines.filter(journal_entry__entry_date__lte=as_of)
        rows = list(
            lines.values('account__code', 'account__name', 'account__account_type')
            .annotate(debit=Sum('debit'), credit=Sum('credit'))
            .order_by('account__code')
        )
        payload = []
        total_dr = total_cr = 0
        for row in rows:
            debit = float(row['debit'] or 0)
            credit = float(row['credit'] or 0)
            total_dr += debit
            total_cr += credit
            payload.append({
                'code': row['account__code'],
                'name': row['account__name'],
                'account_type': row['account__account_type'],
                'debit': debit,
                'credit': credit,
                'balance': round(debit - credit, 2),
            })
        return Response({
            'as_of': as_of,
            'total_debit': round(total_dr, 2),
            'total_credit': round(total_cr, 2),
            'rows': payload,
        })

    @action(detail=False, methods=['get'], url_path='general_ledger')
    def general_ledger(self, request):
        tenant = getattr(request.user, 'tenant', None)
        account_code = request.query_params.get('account')
        lines = JournalLine.objects.filter(
            journal_entry__tenant=tenant,
            journal_entry__status='POSTED',
        ).select_related('account', 'journal_entry').order_by(
            'journal_entry__entry_date', 'journal_entry_id', 'id'
        )
        if account_code:
            lines = lines.filter(account__code=account_code)
        return Response([
            {
                'entry_no': line.journal_entry.entry_no,
                'entry_date': line.journal_entry.entry_date,
                'account_code': line.account.code,
                'account_name': line.account.name,
                'memo': line.journal_entry.memo,
                'debit': line.debit,
                'credit': line.credit,
            }
            for line in lines[:500]
        ])


class AuditLogViewSet(TenantQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all().select_related('actor')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['action', 'entity_type']
    search_fields = ['message', 'entity_type']
    ordering_fields = ['created_at']
