from rest_framework import viewsets, filters, status
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from core.mixins import TenantQuerysetMixin
from core.permissions import (
    IsAdminOrManager,
    IsAdminOrManagerOrReadOnly,
    IsAdminOrManagerNoStaff,
    IsTenantOwner,
    IsMarriageHallApp,
)
from .models import Payment, Expense
from .serializers import PaymentSerializer, ExpenseSerializer
from .services import SoftVoidMixin


class PaymentViewSet(SoftVoidMixin, TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = Payment.objects.all().order_by('-payment_date', '-id')
    serializer_class = PaymentSerializer
    permission_classes = [IsMarriageHallApp, IsAdminOrManager, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'payment_method', 'booking']
    ordering_fields = ['payment_date', 'amount']
    void_status = 'VOIDED'
    source_type = 'payment'

    def get_queryset(self):
        return super().get_queryset().select_related(
            'booking', 'booking__customer', 'booking__venue', 'recorded_by'
        )


class ExpenseViewSet(SoftVoidMixin, TenantQuerysetMixin, viewsets.ModelViewSet):
    queryset = Expense.objects.all().order_by('-expense_date', '-id')
    serializer_class = ExpenseSerializer
    permission_classes = [IsMarriageHallApp, IsAdminOrManagerNoStaff, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status']
    search_fields = ['title', 'description']
    ordering_fields = ['expense_date', 'amount']
    void_status = 'CANCELLED'
    source_type = 'expense'

    def get_queryset(self):
        return super().get_queryset().select_related('created_by', 'updated_by')

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status == 'CANCELLED':
            return Response(
                {'detail': 'Cancelled expenses cannot be modified.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super(SoftVoidMixin, self).update(request, *args, **kwargs)
