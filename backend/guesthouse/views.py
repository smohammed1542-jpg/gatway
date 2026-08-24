from rest_framework import viewsets, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import timedelta, datetime, time
from decimal import Decimal

from core.mixins import TenantQuerysetMixin, TenantAssignMixin
from finance.services import SoftVoidMixin
from core.page_maintenance import page_maintenance_payload
from core.permissions import (
    IsAdminOrManagerOrReadOnly,
    IsAdminOrManager,
    IsAdminOrManagerNoStaff,
    IsGhStaffOrAbove,
    IsTenantOwner,
    IsGuestHouseApp,
)
from .models import Room, StayBooking, StayPayment, StayCharge, GhExpense, GuestHousePageVisibility, GuestHouseService, UnitMedia, Amenity
from .page_visibility import ensure_tenant_gh_pages, GH_MODULE_KEYS, GH_PAGE_KEYS
from .services_catalog import ensure_tenant_gh_services
from .amenities_catalog import ensure_tenant_gh_amenities
from .availability import blocked_unit_ids
from .serializers import (
    RoomSerializer,
    UnitMediaSerializer,
    AmenitySerializer,
    StayBookingSerializer,
    StayPaymentSerializer,
    GhExpenseSerializer,
    GuestHouseServiceSerializer,
)


def _gh_stats_date_range(request):
    """Return (start_dt, end_dt, start_date, end_date) for dashboard period filters."""
    period = request.GET.get('period', 'all')
    start_str = request.GET.get('start_date')
    end_str = request.GET.get('end_date')
    now = timezone.localtime(timezone.now())
    start_dt = end_dt = None
    if start_str and end_str:
        sd, ed = parse_date(start_str), parse_date(end_str)
        if sd and ed:
            start_dt = timezone.make_aware(datetime.combine(sd, time.min))
            end_dt = timezone.make_aware(datetime.combine(ed, time.max))
    elif period == 'today':
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == 'last7days':
        start_dt = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == 'thismonth':
        start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == 'thisyear':
        start_dt = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start_dt, end_dt


class GuestHouseDashboardStatsView(APIView):
    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        start_dt, end_dt = _gh_stats_date_range(request)

        rooms = Room.objects.filter(tenant=tenant)
        all_stays = StayBooking.objects.filter(tenant=tenant)
        stays = all_stays.exclude(status='CANCELLED')
        base_payments = StayPayment.objects.filter(tenant=tenant, status='COMPLETED')
        payments = base_payments
        expenses_qs = GhExpense.objects.filter(tenant=tenant).exclude(status='CANCELLED')
        period_stays = stays

        if start_dt and end_dt:
            payments = payments.filter(payment_date__gte=start_dt, payment_date__lte=end_dt)
            expenses_qs = expenses_qs.filter(
                expense_date__gte=start_dt.date(),
                expense_date__lte=end_dt.date(),
            )
            period_stays = stays.filter(
                created_at__gte=start_dt,
                created_at__lte=end_dt,
            )

        total_revenue = payments.aggregate(t=Sum('amount'))['t'] or 0
        total_expenses = expenses_qs.aggregate(t=Sum('amount'))['t'] or 0
        total_stays = period_stays.count()
        pending_due = sum(
            float(s.remaining_balance)
            for s in stays.filter(payment_status__in=['UNPAID', 'PARTIAL'])[:300]
        )

        active_rooms = rooms.filter(status='ACTIVE').count()
        occupied_today = stays.filter(check_in__lte=today, check_out__gt=today).count()
        occupancy_rate = 0
        if active_rooms > 0:
            occupancy_rate = min(100, round((occupied_today / active_rooms) * 100))

        six_months_ago = timezone.localtime(timezone.now()) - timedelta(days=180)
        revenue_growth = (
            base_payments.filter(payment_date__gte=six_months_ago)
            .annotate(month=TruncMonth('payment_date'))
            .values('month')
            .annotate(revenue=Sum('amount'))
            .order_by('month')[:6]
        )

        stays_by_room = (
            period_stays.values('room__room_number')
            .annotate(value=Count('id'))
            .order_by('-value')[:8]
        )

        stays_by_status = period_stays.values('status').annotate(value=Count('id'))

        recent_stays = StayBookingSerializer(
            all_stays.select_related('customer', 'room').order_by('-created_at')[:8],
            many=True,
        ).data

        recent_payments = list(
            base_payments.select_related('stay', 'stay__customer', 'stay__room')
            .order_by('-payment_date')[:6]
            .values(
                'id', 'amount', 'payment_method', 'payment_date',
                'stay__booking_ref', 'stay__customer__full_name', 'stay__room__room_number',
            )
        )
        for p in recent_payments:
            p['booking_ref'] = p.pop('stay__booking_ref', '')
            p['customer_name'] = p.pop('stay__customer__full_name', '') or 'Guest'
            p['room_number'] = p.pop('stay__room__room_number', '')

        return Response({
            'total_rooms': rooms.count(),
            'active_rooms': active_rooms,
            'occupied_today': occupied_today,
            'occupancy_rate': occupancy_rate,
            'pending_stays': stays.filter(status='PENDING').count(),
            'upcoming_checkins': stays.filter(
                check_in__gte=today,
                status__in=['PENDING', 'CONFIRMED'],
            ).count(),
            'check_ins_today': stays.filter(check_in=today).count(),
            'total_revenue': float(total_revenue),
            'total_expenses': float(total_expenses),
            'net_profit': float(total_revenue) - float(total_expenses),
            'pending_payments': pending_due,
            'total_stays': total_stays,
            'revenue_growth': [
                {'month': item['month'].strftime('%b'), 'revenue': float(item['revenue'] or 0)}
                for item in revenue_growth if item.get('month')
            ],
            'stays_by_room': [
                {'name': item['room__room_number'] or 'Room', 'value': item['value']}
                for item in stays_by_room
            ],
            'stays_by_status': [
                {'name': item['status'], 'value': item['value']}
                for item in stays_by_status
            ],
            'recent_stays': recent_stays,
            'recent_payments': recent_payments,
        })


class GuestHouseReportsView(APIView):
    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        tenant = request.user.tenant
        start = request.GET.get('start_date')
        end = request.GET.get('end_date')
        today = timezone.localdate()
        if not start:
            start = (today - timedelta(days=180)).isoformat()
        if not end:
            end = today.isoformat()

        stays = StayBooking.objects.filter(
            tenant=tenant,
            check_in__gte=start,
            check_in__lte=end,
        ).exclude(status='CANCELLED')
        payments = StayPayment.objects.filter(
            tenant=tenant,
            status='COMPLETED',
            payment_date__date__gte=start,
            payment_date__date__lte=end,
        )
        expenses = GhExpense.objects.filter(
            tenant=tenant,
            expense_date__gte=start,
            expense_date__lte=end,
        )

        revenue = stays.aggregate(t=Sum('total_amount'))['t'] or 0
        collected = payments.aggregate(t=Sum('amount'))['t'] or 0
        expense_total = expenses.aggregate(t=Sum('amount'))['t'] or 0

        by_room = (
            stays.values('room__room_number')
            .annotate(count=Count('id'), revenue=Sum('total_amount'))
            .order_by('-count')[:12]
        )
        by_status = stays.values('status').annotate(count=Count('id'))
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

        stay_count = stays.count()
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
            'avg_stay_value': revenue_f / stay_count if stay_count else 0,
            'stay_count': stay_count,
            'monthly_trends': list(month_map.values()),
            'bookings_by_room': [
                {
                    'room': r['room__room_number'] or '-',
                    'count': r['count'],
                    'revenue': float(r['revenue'] or 0),
                }
                for r in by_room
            ],
            'bookings_by_status': [
                {'status': r['status'], 'count': r['count']}
                for r in by_status
            ],
            'expenses_by_category': [
                {
                    'category': r['category'],
                    'total': float(r['total'] or 0),
                }
                for r in expense_by_cat
            ],
        })


class GuestHouseCalendarView(APIView):
    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        tenant = request.user.tenant
        start = request.GET.get('start')
        end = request.GET.get('end')
        if not start or not end:
            return Response({'detail': 'start and end query params required (YYYY-MM-DD).'}, status=400)
        stays = StayBooking.objects.filter(
            tenant=tenant,
            check_in__lt=end,
            check_out__gt=start,
        ).exclude(status='CANCELLED').select_related('customer', 'room')
        rooms = Room.objects.filter(tenant=tenant, status='ACTIVE').order_by('room_number')
        return Response({
            'stays': StayBookingSerializer(stays, many=True).data,
            'rooms': RoomSerializer(rooms, many=True).data,
        })


class GuestHouseRoomAvailabilityView(APIView):
    """Return rooms available for a check-in / check-out date range (standard PMS feature)."""
    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        tenant = request.user.tenant
        check_in = request.GET.get('check_in')
        check_out = request.GET.get('check_out')
        exclude_stay = request.GET.get('exclude_stay')
        if not check_in or not check_out:
            return Response({'detail': 'check_in and check_out required (YYYY-MM-DD).'}, status=400)
        if check_out <= check_in:
            return Response({'detail': 'check_out must be after check_in.'}, status=400)

        booked_ids = blocked_unit_ids(tenant, check_in, check_out, exclude_stay=exclude_stay)

        all_rooms = (
            Room.objects.filter(tenant=tenant, status='ACTIVE', sellable=True)
            .select_related('parent')
            .prefetch_related('bed_configs', 'children', 'media', 'amenities')
            .order_by('unit_kind', 'room_number')
        )
        available = all_rooms.exclude(id__in=booked_ids)
        room_data = RoomSerializer(all_rooms, many=True, context={'request': request}).data
        for room in room_data:
            room['is_available'] = room['id'] not in booked_ids
        return Response({
            'check_in': check_in,
            'check_out': check_out,
            'all_rooms': room_data,
            'available_rooms': RoomSerializer(available, many=True, context={'request': request}).data,
            'booked_room_ids': list(booked_ids),
            'total_available': available.count(),
            'total_rooms': all_rooms.count(),
        })


class GuestHouseAlertsView(APIView):
    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        tenant = request.user.tenant
        today = timezone.localdate()
        stays = StayBooking.objects.filter(tenant=tenant).exclude(status='CANCELLED')
        upcoming = stays.filter(
            check_in__gte=today,
            check_in__lte=today + timedelta(days=7),
            status__in=['PENDING', 'CONFIRMED'],
        ).select_related('customer', 'room')[:10]
        due = stays.filter(payment_status__in=['UNPAID', 'PARTIAL']).exclude(
            status__in=['CANCELLED', 'CHECKED_OUT']
        ).select_related('customer', 'room')[:10]
        return Response({
            'upcoming_checkins': [
                {
                    'id': s.id,
                    'title': f'{s.customer.display_name} - Room {s.room.room_number}',
                    'desc': f'Check-in {s.check_in}',
                    'date': str(s.check_in),
                }
                for s in upcoming
            ],
            'payment_due': [
                {
                    'id': s.id,
                    'title': f'Balance due: {s.booking_ref}',
                    'desc': f'Rs {s.remaining_balance} remaining - {s.customer.display_name}',
                    'date': str(s.check_in),
                }
                for s in due
            ],
        })


class GuestHouseSearchView(APIView):
    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        q = (request.GET.get('q') or '').strip()
        if len(q) < 2:
            return Response({'stays': [], 'customers': [], 'rooms': []})
        tenant = request.user.tenant
        stays = StayBooking.objects.filter(tenant=tenant).filter(
            Q(booking_ref__icontains=q)
            | Q(customer__full_name__icontains=q)
            | Q(customer__phone__icontains=q)
            | Q(room__room_number__icontains=q)
        )[:8]
        from customers.models import Customer
        customers = Customer.objects.filter(tenant=tenant).filter(
            Q(full_name__icontains=q) | Q(phone__icontains=q) | Q(cnic__icontains=q)
        )[:8]
        rooms = Room.objects.filter(tenant=tenant).filter(
            Q(room_number__icontains=q) | Q(description__icontains=q)
        )[:8]
        return Response({
            'stays': [
                {
                    'id': s.id,
                    'booking_ref': s.booking_ref,
                    'customer_name': s.customer.display_name,
                    'room_number': s.room.room_number,
                }
                for s in stays.select_related('customer', 'room')
            ],
            'customers': [
                {'id': c.id, 'name': c.display_name, 'phone': c.phone}
                for c in customers
            ],
            'rooms': [{'id': r.id, 'room_number': r.room_number} for r in rooms],
        })


class RoomViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = (
        Room.objects.all()
        .select_related('parent')
        .prefetch_related('bed_configs', 'children', 'media', 'amenities')
        .order_by('unit_kind', 'room_number')
    )
    serializer_class = RoomSerializer
    permission_classes = [IsGuestHouseApp, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'room_type', 'unit_kind', 'parent', 'sellable']
    search_fields = ['room_number', 'description']
    ordering_fields = ['price_per_night', 'room_number', 'created_at']

    def get_queryset(self):
        tenant = self.request.user.tenant
        if tenant:
            ensure_tenant_gh_amenities(tenant)
        return super().get_queryset()

    @action(detail=True, methods=['get', 'post'], url_path='media')
    def media(self, request, pk=None):
        room = self.get_object()
        if request.method == 'GET':
            qs = room.media.all()
            return Response(UnitMediaSerializer(qs, many=True, context={'request': request}).data)

        upload = request.FILES.get('file') or request.FILES.get('image')
        if not upload:
            return Response({'detail': 'file is required.'}, status=400)
        caption = request.data.get('caption', '')
        is_cover = str(request.data.get('is_cover', '')).lower() in ('1', 'true', 'yes')
        sort_order = request.data.get('sort_order')
        if sort_order is None:
            last = room.media.order_by('-sort_order').values_list('sort_order', flat=True).first()
            sort_order = (last or 0) + 10
        if is_cover or not room.media.exists():
            is_cover = True
        media = UnitMedia.objects.create(
            unit=room,
            file=upload,
            caption=caption or '',
            sort_order=int(sort_order),
            is_cover=is_cover,
        )
        return Response(
            UnitMediaSerializer(media, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['patch', 'delete'], url_path=r'media/(?P<media_id>[^/.]+)')
    def media_item(self, request, pk=None, media_id=None):
        room = self.get_object()
        try:
            media = room.media.get(pk=media_id)
        except UnitMedia.DoesNotExist:
            return Response({'detail': 'Media not found.'}, status=404)

        if request.method == 'DELETE':
            was_cover = media.is_cover
            media.file.delete(save=False)
            media.delete()
            if was_cover:
                nxt = room.media.order_by('sort_order', 'id').first()
                if nxt:
                    nxt.is_cover = True
                    nxt.save(update_fields=['is_cover'])
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = UnitMediaSerializer(
            media,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UnitMediaSerializer(media, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='media/reorder')
    def media_reorder(self, request, pk=None):
        room = self.get_object()
        order = request.data.get('order') or []
        if not isinstance(order, list):
            return Response({'detail': 'order must be a list of media ids.'}, status=400)
        id_to_media = {m.id: m for m in room.media.filter(id__in=order)}
        for index, media_id in enumerate(order):
            media = id_to_media.get(int(media_id))
            if media:
                media.sort_order = index * 10
                media.save(update_fields=['sort_order'])
        qs = room.media.all()
        return Response(UnitMediaSerializer(qs, many=True, context={'request': request}).data)


class AmenityViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = Amenity.objects.all().order_by('sort_order', 'name')
    serializer_class = AmenitySerializer
    permission_classes = [IsGuestHouseApp, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code']

    def get_queryset(self):
        tenant = self.request.user.tenant
        if tenant:
            ensure_tenant_gh_amenities(tenant)
        qs = super().get_queryset()
        if self.request.query_params.get('include_inactive') != '1':
            qs = qs.filter(is_active=True)
        return qs


class GuestHouseServiceViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = GuestHouseService.objects.all().order_by('sort_order', 'label')
    serializer_class = GuestHouseServiceSerializer
    permission_classes = [IsGuestHouseApp, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active', 'pricing_unit']
    search_fields = ['label', 'code']

    def get_queryset(self):
        tenant = self.request.user.tenant
        if tenant:
            ensure_tenant_gh_services(tenant)
        qs = super().get_queryset()
        if self.request.query_params.get('include_inactive') != '1':
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.rooms.clear()
        instance.is_active = False
        instance.save(update_fields=['is_active'])


class StayBookingViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = StayBooking.objects.select_related('customer', 'room').prefetch_related(
        'charges', 'charges__service', 'guest_roster', 'guest_roster__customer',
    ).all()
    serializer_class = StayBookingSerializer
    permission_classes = [IsGuestHouseApp, IsGhStaffOrAbove, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'payment_status', 'room', 'customer']
    search_fields = ['booking_ref', 'customer__full_name', 'room__room_number', 'customer__phone']
    ordering_fields = ['check_in', 'check_out', 'created_at']

    def destroy(self, request, *args, **kwargs):
        role = getattr(request.user, 'role', None)
        if not request.user.is_superuser and role not in ('ADMIN', 'MANAGER'):
            return Response(
                {'detail': 'Only managers can delete stays. Use cancel instead.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        extra = {'created_by': user}
        if user.tenant_id:
            extra['tenant'] = user.tenant
        advance_method = self.request.data.get('advance_payment_method', 'CASH')
        if advance_method not in dict(StayPayment.METHOD_CHOICES):
            advance_method = 'CASH'
        try:
            advance_amount = Decimal(str(self.request.data.get('advance_paid', 0) or 0))
        except Exception:
            advance_amount = Decimal('0')
        if advance_amount < 0:
            advance_amount = Decimal('0')
        stay = serializer.save(**extra)
        if advance_amount > 0:
            StayPayment.objects.create(
                tenant=stay.tenant,
                stay=stay,
                amount=advance_amount,
                payment_method=advance_method,
                status='COMPLETED',
                notes='Initial advance on booking',
                recorded_by=user,
            )

    @action(detail=True, methods=['post'])
    def check_in(self, request, pk=None):
        stay = self.get_object()
        if stay.status == 'CANCELLED':
            return Response({'detail': 'Cancelled stay cannot be checked in.'}, status=400)
        balance_due = stay.remaining_balance
        if balance_due > 0 and not request.data.get('acknowledge_balance'):
            return Response({
                'detail': f'Balance due: Rs {balance_due}. Collect payment or acknowledge to proceed.',
                'balance_due': float(balance_due),
                'requires_acknowledgement': True,
            }, status=400)
        stay.status = 'CHECKED_IN'
        stay.save(update_fields=['status', 'updated_at'])
        data = StayBookingSerializer(stay).data
        if balance_due > 0:
            data['check_in_warning'] = f'Checked in with Rs {balance_due} balance due.'
        return Response(data)

    @action(detail=True, methods=['post'])
    def check_out(self, request, pk=None):
        stay = self.get_object()
        balance_due = stay.remaining_balance
        if balance_due > 0 and not request.data.get('acknowledge_balance'):
            return Response({
                'detail': f'Cannot check out - Rs {balance_due} still due.',
                'balance_due': float(balance_due),
                'requires_acknowledgement': True,
            }, status=400)
        stay.status = 'CHECKED_OUT'
        stay.save(update_fields=['status', 'updated_at'])
        return Response(StayBookingSerializer(stay).data)

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsGuestHouseApp, IsGhStaffOrAbove, IsTenantOwner],
    )
    def cancel(self, request, pk=None):
        stay = self.get_object()
        if stay.status == 'CANCELLED':
            return Response({'detail': 'Stay is already cancelled.'}, status=400)
        if stay.status == 'CHECKED_IN':
            return Response({'detail': 'Checked-in stay must be checked out first.'}, status=400)
        if stay.status == 'CHECKED_OUT':
            return Response({'detail': 'Checked-out stay cannot be cancelled.'}, status=400)

        reason = (request.data.get('reason') or '').strip()
        refund_advance = bool(request.data.get('refund_advance', False))
        paid = stay.advance_paid or Decimal('0')
        stay.status = 'CANCELLED'
        stay.cancellation_reason = reason
        stay.cancelled_at = timezone.now()
        stay.save(update_fields=['status', 'cancellation_reason', 'cancelled_at', 'updated_at'])
        if refund_advance and paid > 0:
            StayPayment.objects.create(
                tenant=stay.tenant,
                stay=stay,
                amount=-paid,
                payment_method='CASH',
                status='COMPLETED',
                notes='Refund on cancellation',
                recorded_by=request.user,
            )
        stay.refresh_from_db()
        return Response(StayBookingSerializer(stay, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        stay = self.get_object()
        if stay.status == 'PENDING':
            stay.status = 'CONFIRMED'
            stay.save(update_fields=['status', 'updated_at'])
        return Response(StayBookingSerializer(stay).data)

    @action(detail=True, methods=['post'])
    def add_charge(self, request, pk=None):
        stay = self.get_object()
        if stay.status in ('CANCELLED', 'CHECKED_OUT'):
            return Response({'detail': 'Cannot add charges to this stay.'}, status=400)
        description = (request.data.get('description') or '').strip()
        if not description:
            return Response({'detail': 'Description is required.'}, status=400)
        try:
            amount = Decimal(str(request.data.get('amount', 0)))
        except Exception:
            return Response({'detail': 'Invalid amount.'}, status=400)
        if amount <= 0:
            return Response({'detail': 'Amount must be greater than zero.'}, status=400)
        StayCharge.objects.create(
            stay=stay,
            charge_type='CUSTOM',
            description=description[:255],
            quantity=1,
            unit_price=amount,
            amount=amount,
        )
        stay.recalculate_total()
        stay.save()
        return Response(StayBookingSerializer(stay, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def remove_charge(self, request, pk=None):
        stay = self.get_object()
        if stay.status in ('CANCELLED', 'CHECKED_OUT'):
            return Response({'detail': 'Cannot modify charges on this stay.'}, status=400)
        charge_id = request.data.get('charge_id')
        if not charge_id:
            return Response({'detail': 'charge_id is required.'}, status=400)
        charge = stay.charges.filter(pk=charge_id, charge_type='CUSTOM').first()
        if not charge:
            return Response({'detail': 'Custom charge not found.'}, status=404)
        charge.delete()
        stay.recalculate_total()
        stay.save()
        return Response(StayBookingSerializer(stay, context={'request': request}).data)


class StayPaymentViewSet(SoftVoidMixin, TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = StayPayment.objects.select_related('stay', 'stay__customer', 'stay__room').all()
    serializer_class = StayPaymentSerializer
    permission_classes = [IsGuestHouseApp, IsGhStaffOrAbove, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'payment_method', 'stay']
    ordering_fields = ['payment_date', 'amount']
    void_status = 'VOIDED'
    source_type = 'stay_payment'

    def perform_create(self, serializer):
        user = self.request.user
        extra = {'recorded_by': user}
        if user.tenant_id:
            extra['tenant'] = user.tenant
        serializer.save(**extra)

    def destroy(self, request, *args, **kwargs):
        role = getattr(request.user, 'role', None)
        if not request.user.is_superuser and role not in ('ADMIN', 'MANAGER'):
            return Response(
                {'detail': 'Only managers can void payment records.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class GhExpenseViewSet(SoftVoidMixin, TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = GhExpense.objects.all().order_by('-expense_date')
    serializer_class = GhExpenseSerializer
    permission_classes = [IsGuestHouseApp, IsAdminOrManagerNoStaff, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status']
    search_fields = ['title', 'description']
    ordering_fields = ['expense_date', 'amount']
    void_status = 'CANCELLED'
    source_type = 'gh_expense'

    def perform_create(self, serializer):
        user = self.request.user
        extra = {'created_by': user}
        if user.tenant_id:
            extra['tenant'] = user.tenant
        serializer.save(**extra)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'CANCELLED':
            return Response(
                {'detail': 'Cancelled expenses cannot be modified.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super(SoftVoidMixin, self).update(request, *args, **kwargs)


def _gh_target_date(request):
    date_str = request.GET.get('date')
    if date_str:
        parsed = parse_date(date_str)
        if parsed:
            return parsed
    return timezone.localdate()


def _stay_daily_dict(stay):
    return {
        'id': stay.id,
        'booking_ref': stay.booking_ref or f'STAY-{stay.id}',
        'customer_name': stay.customer.display_name,
        'customer_phone': stay.customer.phone or '',
        'room_number': stay.room.room_number,
        'check_in': stay.check_in.isoformat(),
        'check_out': stay.check_out.isoformat(),
        'guests_count': stay.guests_count,
        'status': stay.status,
        'payment_status': stay.payment_status,
        'total_amount': str(stay.total_amount),
        'advance_paid': str(stay.advance_paid),
    }


class GuestHouseDailyView(APIView):
    """Daily guest directory - in-house, arrivals, departures, and active reservations."""

    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        target = _gh_target_date(request)
        stays = (
            StayBooking.objects.filter(tenant=tenant)
            .select_related('customer', 'room')
            .exclude(status='CANCELLED')
        )

        reservations = stays.filter(check_in__lte=target, check_out__gt=target)
        arrivals = stays.filter(check_in=target)
        departures = stays.filter(check_out=target)
        in_house = stays.filter(check_in__lte=target, check_out__gt=target, status='CHECKED_IN')

        return Response({
            'date': target.isoformat(),
            'counts': {
                'reservations': reservations.count(),
                'arrivals': arrivals.count(),
                'departures': departures.count(),
                'in_house': in_house.count(),
            },
            'reservations': [_stay_daily_dict(s) for s in reservations.order_by('room__room_number')],
            'arrivals': [_stay_daily_dict(s) for s in arrivals.order_by('room__room_number')],
            'departures': [_stay_daily_dict(s) for s in departures.order_by('room__room_number')],
            'in_house': [_stay_daily_dict(s) for s in in_house.order_by('room__room_number')],
        })


class GuestHouseRecordsView(APIView):
    """Unified ledger of stays, payments, and expense vouchers."""

    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        date_str = request.GET.get('date')
        record_type = request.GET.get('type', 'all')
        target = parse_date(date_str) if date_str else None
        records = []

        if record_type in ('all', 'stay'):
            stays = (
                StayBooking.objects.filter(tenant=tenant)
                .select_related('customer', 'room')
                .exclude(status='CANCELLED')
            )
            if target:
                stays = stays.filter(
                    Q(created_at__date=target)
                    | Q(check_in=target)
                    | Q(check_in__lte=target, check_out__gt=target)
                )
            for stay in stays.order_by('-created_at')[:300]:
                records.append({
                    'id': stay.id,
                    'record_type': 'stay',
                    'record_type_label': 'Reservation / Stay',
                    'ref': stay.booking_ref or f'STAY-{stay.id}',
                    'title': stay.customer.display_name,
                    'subtitle': f'Room {stay.room.room_number} · {stay.check_in} → {stay.check_out}',
                    'amount': float(stay.total_amount or 0),
                    'status': stay.status,
                    'date': stay.created_at.isoformat(),
                    'sort_ts': stay.created_at.timestamp(),
                    'link_path': f'/gh/stays/{stay.id}',
                })

        if record_type in ('all', 'payment'):
            payments = StayPayment.objects.filter(tenant=tenant).select_related(
                'stay', 'stay__customer', 'stay__room',
            )
            if target:
                payments = payments.filter(payment_date__date=target)
            for payment in payments.order_by('-payment_date')[:300]:
                records.append({
                    'id': payment.id,
                    'record_type': 'payment',
                    'record_type_label': 'Payment / Collection',
                    'ref': payment.stay.booking_ref or f'PAY-{payment.id}',
                    'title': payment.stay.customer.display_name,
                    'subtitle': f'Room {payment.stay.room.room_number} · {payment.get_payment_method_display()}',
                    'amount': float(payment.amount or 0),
                    'status': payment.status,
                    'date': payment.payment_date.isoformat(),
                    'sort_ts': payment.payment_date.timestamp(),
                    'link_path': f'/gh/payments/{payment.id}/edit',
                })

        if record_type in ('all', 'expense'):
            expenses = GhExpense.objects.filter(tenant=tenant)
            if target:
                expenses = expenses.filter(expense_date=target)
            for expense in expenses.order_by('-expense_date', '-id')[:300]:
                records.append({
                    'id': expense.id,
                    'record_type': 'expense',
                    'record_type_label': 'Expense / Voucher',
                    'ref': f'VCH-{expense.id}',
                    'title': expense.title,
                    'subtitle': expense.get_category_display(),
                    'amount': float(expense.amount or 0),
                    'status': expense.category,
                    'date': expense.expense_date.isoformat(),
                    'sort_ts': datetime.combine(expense.expense_date, time.max).timestamp(),
                    'link_path': f'/gh/expenses/{expense.id}',
                })

        records.sort(key=lambda r: r['sort_ts'], reverse=True)
        for row in records:
            row.pop('sort_ts', None)

        counts = {
            'stay': sum(1 for r in records if r['record_type'] == 'stay'),
            'payment': sum(1 for r in records if r['record_type'] == 'payment'),
            'expense': sum(1 for r in records if r['record_type'] == 'expense'),
            'total': len(records),
        }

        return Response({
            'date': target.isoformat() if target else None,
            'records': records,
            'counts': counts,
        })


class GuestHousePageVisibilityView(APIView):
    """Return per-tenant Guest House page visibility for the frontend sidebar and route guards."""

    permission_classes = [IsAuthenticated, IsGuestHouseApp]

    def get(self, request):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        ensure_tenant_gh_pages(tenant)
        rows = GuestHousePageVisibility.objects.filter(tenant=tenant).order_by('sort_order', 'page_key')
        pages = []
        modules = []
        for row in rows:
            maint = page_maintenance_payload(row)
            item = {
                'key': row.page_key,
                'label': row.label,
                'is_visible': row.is_visible,
                **maint,
            }
            if row.page_key in GH_MODULE_KEYS:
                modules.append(item)
            elif row.page_key in GH_PAGE_KEYS:
                pages.append(item)
        return Response({'pages': pages, 'modules': modules})
