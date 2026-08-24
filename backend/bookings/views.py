from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction

from core.mixins import TenantQuerysetMixin, TenantAssignMixin
from core.page_maintenance import page_maintenance_payload
from core.permissions import IsAdminOrManagerOrReadOnly, IsTenantOwner, IsMarriageHallApp
from .models import Booking, MarriageHallPageVisibility
from .serializers import BookingSerializer
from .page_visibility import ensure_tenant_hall_pages, HALL_PAGE_KEYS


class BookingViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = Booking.objects.all().order_by('-event_date', '-id')
    serializer_class = BookingSerializer
    permission_classes = [IsMarriageHallApp, IsAdminOrManagerOrReadOnly, IsTenantOwner]
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
