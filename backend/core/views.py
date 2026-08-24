from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from core.permissions import IsAdminOnly, IsMarriageHallApp, IsGuestHouseApp
from django.db.models import Sum, Count, F, Q, DecimalField, ExpressionWrapper
from django.utils import timezone
from datetime import timedelta
from bookings.models import Booking
from customers.models import Customer
from finance.models import Payment, Expense
from venues.models import Venue
from inventory.models import InventoryItem
from rest_framework import viewsets
from finance.models import Payment
from .models import UserSettings, NotificationLog
from .serializers import TenantSerializer, UserSettingsSerializer, NotificationLogSerializer
from core.mixins import TenantQuerysetMixin
from core.permissions import IsAdminOrManagerOrReadOnly, IsTenantOwner

class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated, IsMarriageHallApp]

    def get(self, request):
        tenant = request.user.tenant
        
        period = request.GET.get('period', 'all')
        start_date_str = request.GET.get('start_date')
        end_date_str = request.GET.get('end_date')
        
        now = timezone.localtime(timezone.now())
        start_date = None
        end_date = None
        
        import datetime
        from django.utils.dateparse import parse_date
        
        if start_date_str and end_date_str:
            try:
                start_date_val = parse_date(start_date_str)
                end_date_val = parse_date(end_date_str)
                if start_date_val and end_date_val:
                    start_date = timezone.make_aware(datetime.datetime.combine(start_date_val, datetime.time.min))
                    end_date = timezone.make_aware(datetime.datetime.combine(end_date_val, datetime.time.max))
            except:
                pass
        elif period == 'today':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        elif period == 'last7days':
            start_date = (now - datetime.timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        elif period == 'thismonth':
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        elif period == 'thisyear':
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59, microsecond=999999)

        if tenant:
            base_payment_qs = Payment.objects.filter(tenant=tenant)
            payment_qs = Payment.objects.filter(tenant=tenant)
            expense_qs = Expense.objects.filter(tenant=tenant).exclude(status='CANCELLED')
            booking_qs = Booking.objects.filter(tenant=tenant)
        else:
            base_payment_qs = Payment.objects.all()
            payment_qs = Payment.objects.all()
            expense_qs = Expense.objects.all().exclude(status='CANCELLED')
            booking_qs = Booking.objects.all()
        
        if start_date and end_date:
            payment_qs = payment_qs.filter(payment_date__gte=start_date, payment_date__lte=end_date)
            # expense_date is DateField, need to extract date
            expense_qs = expense_qs.filter(expense_date__gte=start_date.date(), expense_date__lte=end_date.date())
            booking_qs = booking_qs.filter(created_at__gte=start_date, created_at__lte=end_date)

        # Financial Stats
        total_revenue = payment_qs.filter(
            status='COMPLETED'
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        total_expenses = expense_qs.aggregate(total=Sum('amount'))['total'] or 0
        
        # Booking Stats
        total_bookings = booking_qs.count()
        pending_payments = booking_qs.filter(
            remaining_balance__gt=0,
            booking_status__in=['PENDING', 'CONFIRMED', 'COMPLETED'],
        ).aggregate(total=Sum('remaining_balance'))['total'] or 0
        
        # Recent Activity (Always get recent regardless of filter, or based on filter)
        recent_bookings = booking_qs.order_by('-created_at')[:5]
        
        # Occupancy Rate (Simplistic: booked days in current month / total capacity days)
        # This is a placeholder for more complex logic
        
        # Revenue Growth (Last 6 Months)
        import datetime
        from django.db.models.functions import TruncMonth
        six_months_ago = now - datetime.timedelta(days=180)
        revenue_growth = base_payment_qs.filter(status='COMPLETED', payment_date__gte=six_months_ago) \
            .annotate(month=TruncMonth('payment_date')) \
            .values('month') \
            .annotate(revenue=Sum('amount')) \
            .order_by('month')[:6]

        # Bookings by Hall
        bookings_by_hall = booking_qs \
            .values('venue__name') \
            .annotate(value=Count('id')) \
            .order_by('-value')

        # Inventory (tenant-wide; not filtered by booking date range)
        inv_qs = InventoryItem.objects.filter(tenant=tenant) if tenant else InventoryItem.objects.all()
        category_labels = dict(InventoryItem.CATEGORY_CHOICES)
        inventory_by_category = inv_qs.values('category').annotate(value=Count('id')).order_by('-value')
        stock_value = inv_qs.aggregate(
            total=Sum(
                ExpressionWrapper(
                    F('quantity') * F('price_per_unit'),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                )
            )
        )['total'] or 0
        attention_qs = inv_qs.filter(status__in=['LOW_STOCK', 'OUT_OF_STOCK']).order_by('quantity')[:5]

        return Response({
            'total_revenue': total_revenue,
            'total_expenses': total_expenses,
            'net_profit': total_revenue - total_expenses,
            'total_bookings': total_bookings,
            'pending_payments': pending_payments,
            'revenue_growth': [
                {'month': item['month'].strftime('%b'), 'revenue': float(item['revenue'])}
                for item in revenue_growth if item['month']
            ],
            'bookings_by_hall': [
                {'name': item['venue__name'], 'value': item['value']}
                for item in bookings_by_hall
            ],
            'recent_bookings': [
                {'id': b.id, 'event': b.event_name, 'customer': b.customer.display_name, 'status': b.booking_status}
                for b in recent_bookings
            ],
            'inventory_total_items': inv_qs.count(),
            'inventory_alerts': inv_qs.filter(status__in=['LOW_STOCK', 'OUT_OF_STOCK']).count(),
            'inventory_stock_value': float(stock_value),
            'inventory_by_category': [
                {'name': category_labels.get(row['category'], row['category']), 'value': row['value']}
                for row in inventory_by_category
            ],
            'inventory_attention_items': [
                {
                    'id': row.id,
                    'name': row.name,
                    'quantity': row.quantity,
                    'unit': row.unit,
                    'status': row.status,
                }
                for row in attention_qs
            ],
        })


def _get_or_create_user_settings(user):
    settings_obj, _ = UserSettings.objects.get_or_create(user=user)
    return settings_obj


class TenantDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No venue linked to this account.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(TenantSerializer(tenant).data)

    def patch(self, request):
        if getattr(request.user, 'role', None) != 'ADMIN' and not request.user.is_superuser:
            return Response({'detail': 'Only admins can update venue settings.'}, status=status.HTTP_403_FORBIDDEN)
        tenant = request.user.tenant
        if not tenant:
            return Response({'detail': 'No venue linked to this account.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = TenantSerializer(tenant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class UserSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        obj = _get_or_create_user_settings(request.user)
        return Response(UserSettingsSerializer(obj).data)

    def patch(self, request):
        obj = _get_or_create_user_settings(request.user)
        serializer = UserSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated, IsMarriageHallApp]

    def get(self, request):
        q = (request.GET.get('q') or '').strip()
        if len(q) < 2:
            return Response({'bookings': [], 'customers': [], 'venues': [], 'payments': [], 'inventory': []})

        tenant = request.user.tenant
        if not tenant and not request.user.is_superuser:
            return Response({'bookings': [], 'customers': [], 'venues': [], 'payments': [], 'inventory': []})

        booking_qs = Booking.objects.filter(tenant=tenant) if tenant else Booking.objects.none()
        customer_qs = Customer.objects.filter(tenant=tenant) if tenant else Customer.objects.none()
        venue_qs = Venue.objects.filter(tenant=tenant) if tenant else Venue.objects.none()
        payment_qs = Payment.objects.filter(tenant=tenant) if tenant else Payment.objects.none()
        inventory_qs = InventoryItem.objects.filter(tenant=tenant) if tenant else InventoryItem.objects.none()

        bookings = booking_qs.filter(
            Q(event_name__icontains=q)
            | Q(booking_id__icontains=q)
            | Q(customer__full_name__icontains=q)
            | Q(customer__first_name__icontains=q)
            | Q(customer__last_name__icontains=q)
            | Q(customer__phone__icontains=q)
        ).select_related('customer', 'venue')[:8]

        customers = customer_qs.filter(
            Q(full_name__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(phone__icontains=q)
            | Q(email__icontains=q)
            | Q(cnic__icontains=q)
        )[:8]

        venues = venue_qs.filter(Q(name__icontains=q) | Q(location__icontains=q))[:6]
        payments = payment_qs.filter(
            Q(booking__event_name__icontains=q)
            | Q(booking__booking_id__icontains=q)
            | Q(notes__icontains=q)
        ).select_related('booking')[:6]
        inventory = inventory_qs.filter(Q(name__icontains=q) | Q(description__icontains=q))[:6]

        return Response({
            'bookings': [
                {
                    'id': b.id,
                    'event_name': b.event_name,
                    'booking_id': b.booking_id,
                    'customer_name': str(b.customer),
                    'venue_name': b.venue.name if b.venue else '',
                    'event_date': b.event_date,
                    'slot': b.slot,
                }
                for b in bookings
            ],
            'customers': [
                {
                    'id': c.id,
                    'name': c.full_name or f'{c.first_name} {c.last_name}'.strip(),
                    'phone': c.phone,
                }
                for c in customers
            ],
            'venues': [{'id': v.id, 'name': v.name, 'location': v.location} for v in venues],
            'payments': [
                {
                    'id': p.id,
                    'amount': float(p.amount),
                    'booking_id': p.booking_id,
                    'event_name': p.booking.event_name if p.booking else '',
                }
                for p in payments
            ],
            'inventory': [{'id': i.id, 'name': i.name, 'quantity': i.quantity} for i in inventory],
        })


class NotificationLogViewSet(TenantQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = NotificationLog.objects.all().order_by('-created_at')
    serializer_class = NotificationLogSerializer
    permission_classes = [IsAuthenticated, IsTenantOwner]

    def get_queryset(self):
        return super().get_queryset().select_related('booking', 'customer')


class AlertsView(APIView):
    """Upcoming events and payment reminders for realtime dashboard/notifications."""
    permission_classes = [IsAuthenticated, IsMarriageHallApp]

    def get(self, request):
        tenant = request.user.tenant
        today = timezone.localdate()
        week_ahead = today + timedelta(days=7)
        month_ahead = today + timedelta(days=30)

        booking_qs = Booking.objects.filter(tenant=tenant) if tenant else Booking.objects.all()
        booking_qs = booking_qs.filter(booking_status__in=['PENDING', 'CONFIRMED']).select_related('customer', 'venue')

        upcoming_events = booking_qs.filter(
            event_date__gte=today,
            event_date__lte=week_ahead,
        ).order_by('event_date', 'slot')[:15]

        payment_due = booking_qs.filter(
            event_date__gte=today,
            event_date__lte=month_ahead,
            remaining_balance__gt=0,
            booking_status__in=['PENDING', 'CONFIRMED', 'COMPLETED'],
        ).order_by('event_date')[:15]

        low_stock = InventoryItem.objects.filter(
            tenant=tenant,
            status__in=['LOW_STOCK', 'OUT_OF_STOCK'],
        ) if tenant else InventoryItem.objects.filter(status__in=['LOW_STOCK', 'OUT_OF_STOCK'])
        low_stock = low_stock[:10]

        return Response({
            'upcoming_events': [
                {
                    'id': b.id,
                    'type': 'event',
                    'title': b.event_name,
                    'desc': f"{b.venue.name if b.venue else 'Hall'} - {b.slot} slot",
                    'date': b.event_date.isoformat() if b.event_date else None,
                    'customer': str(b.customer),
                    'remaining_balance': float(b.remaining_balance),
                }
                for b in upcoming_events
            ],
            'payment_due': [
                {
                    'id': b.id,
                    'type': 'payment_due',
                    'title': 'Balance due',
                    'desc': f"{b.event_name} - Rs {float(b.remaining_balance):,.0f} remaining",
                    'date': b.event_date.isoformat() if b.event_date else None,
                    'customer': str(b.customer),
                    'amount': float(b.remaining_balance),
                }
                for b in payment_due
            ],
            'inventory_alerts': [
                {
                    'id': item.id,
                    'type': 'inventory',
                    'title': item.name,
                    'desc': f"{item.quantity} {item.unit} left ({item.get_status_display()})",
                }
                for item in low_stock
            ],
        })
