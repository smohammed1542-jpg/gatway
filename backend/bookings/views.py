from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Sum, Count
from django.db.models.functions import TruncMonth
from django.utils import timezone
from datetime import timedelta

from finance.models import Payment, Expense

from core.mixins import TenantQuerysetMixin, TenantAssignMixin
from core.page_maintenance import page_maintenance_payload
from core.permissions import IsAdminOrManager, IsAdminOrManagerOrStaffWrite, IsTenantOwner, IsMarriageHallApp
from .models import Booking, MarriageHallPageVisibility
from .serializers import BookingSerializer
from .page_visibility import ensure_tenant_hall_pages, HALL_PAGE_KEYS


class BookingViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = Booking.objects.all().order_by('-event_date', '-id')
    serializer_class = BookingSerializer
    permission_classes = [IsMarriageHallApp, IsAdminOrManagerOrStaffWrite, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['booking_status', 'payment_status', 'venue', 'customer', 'decoration_package']
    search_fields = ['event_name', 'customer__first_name', 'customer__last_name', 'customer__full_name']
    ordering_fields = ['start_date', 'created_at']

    def get_queryset(self):
        return super().get_queryset().select_related('customer', 'venue', 'decoration_package')

    @transaction.atomic
    def perform_create(self, serializer):
        super().perform_create(serializer)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        from bookings.services import SalesService

        booking = self.get_object()
        reason = (request.data.get('reason') or '').strip()
        refund_advance = bool(request.data.get('refund_advance', False))
        try:
            SalesService.cancel(
                booking,
                reason=reason,
                refund_advance=refund_advance,
                user=request.user if request.user.is_authenticated else None,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)

        booking.refresh_from_db()
        return Response(BookingSerializer(booking, context={'request': request}).data)


class MarriageHallPageVisibilityView(APIView):
    """Return per-tenant Marriage Hall page maintenance flags for the frontend."""

    permission_classes = [IsAuthenticated, IsMarriageHallApp]

    def get(self, request):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        ensure_tenant_hall_pages(tenant)
        rows = MarriageHallPageVisibility.objects.filter(tenant=tenant).order_by('sort_order', 'page_key')
        pages = []
        for row in rows:
            if row.page_key not in HALL_PAGE_KEYS:
                continue
            maint = page_maintenance_payload(row)
            pages.append({
                'key': row.page_key,
                'label': row.label,
                'is_visible': row.is_visible,
                **maint,
            })
        return Response({'pages': pages})


class MarriageHallReportsView(APIView):
    """Aggregated Marriage Hall business reports for the date range."""

    permission_classes = [IsAuthenticated, IsMarriageHallApp, IsAdminOrManager]

    def get(self, request):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        start = request.GET.get('start_date') or (today - timedelta(days=180)).isoformat()
        end = request.GET.get('end_date') or today.isoformat()

        bookings = Booking.objects.filter(
            tenant=tenant,
            event_date__gte=start,
            event_date__lte=end,
        ).exclude(booking_status='CANCELLED')
        payments = Payment.objects.filter(
            tenant=tenant,
            status='COMPLETED',
            payment_date__date__gte=start,
            payment_date__date__lte=end,
        )
        expenses = Expense.objects.filter(
            tenant=tenant,
            expense_date__gte=start,
            expense_date__lte=end,
        ).exclude(status='CANCELLED')

        revenue = bookings.aggregate(t=Sum('total_price'))['t'] or 0
        collected = payments.aggregate(t=Sum('amount'))['t'] or 0
        expense_total = expenses.aggregate(t=Sum('amount'))['t'] or 0

        by_venue = (
            bookings.values('venue__name')
            .annotate(count=Count('id'), revenue=Sum('total_price'))
            .order_by('-count')[:12]
        )
        by_status = bookings.values('booking_status').annotate(count=Count('id'))
        expense_by_cat = expenses.values('category').annotate(total=Sum('amount'))

        monthly_income = (
            payments.annotate(month=TruncMonth('payment_date'))
            .values('month')
            .annotate(income=Sum('amount'))
            .order_by('month')
        )
        monthly_expense = (
            expenses.annotate(month=TruncMonth('expense_date'))
            .values('month')
            .annotate(expense=Sum('amount'))
            .order_by('month')
        )
        month_map = {}
        for row in monthly_income:
            if row.get('month'):
                key = row['month'].strftime('%b %Y')
                month_map[key] = {'month': key, 'income': float(row['income'] or 0), 'expense': 0}
        for row in monthly_expense:
            if row.get('month'):
                key = row['month'].strftime('%b %Y')
                if key not in month_map:
                    month_map[key] = {'month': key, 'income': 0, 'expense': 0}
                month_map[key]['expense'] = float(row['expense'] or 0)

        booking_count = bookings.count()
        revenue_f = float(revenue)
        collected_f = float(collected)
        expense_f = float(expense_total)

        return Response({
            'start_date': start,
            'end_date': end,
            'total_revenue': revenue_f,
            'total_collected': collected_f,
            'total_expenses': expense_f,
            'net_profit': collected_f - expense_f,
            'collection_gap': max(0, revenue_f - collected_f),
            'avg_booking_value': revenue_f / booking_count if booking_count else 0,
            'booking_count': booking_count,
            'monthly_trends': list(month_map.values()),
            'bookings_by_venue': [
                {
                    'venue': r['venue__name'] or '-',
                    'count': r['count'],
                    'revenue': float(r['revenue'] or 0),
                }
                for r in by_venue
            ],
            'bookings_by_status': [
                {'status': r['booking_status'], 'count': r['count']}
                for r in by_status
            ],
            'expenses_by_category': [
                {'category': r['category'], 'total': float(r['total'] or 0)}
                for r in expense_by_cat
            ],
        })
