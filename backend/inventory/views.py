from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend

from core.mixins import TenantQuerysetMixin, TenantAssignMixin
from core.permissions import IsAdminOrManagerOrReadOnly, IsTenantOwner, IsMarriageHallApp
from .models import InventoryItem, BookingInventoryItem, InventoryTransaction
from .serializers import (
    InventoryItemSerializer,
    BookingInventoryItemSerializer,
    InventoryTransactionSerializer,
)
from .services import InventoryService


class InventoryItemViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = InventoryItem.objects.all().order_by('name')
    serializer_class = InventoryItemSerializer
    permission_classes = [IsMarriageHallApp, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'quantity', 'price_per_unit', 'last_restocked']


class BookingInventoryItemViewSet(TenantQuerysetMixin, TenantAssignMixin, viewsets.ModelViewSet):
    queryset = BookingInventoryItem.objects.all().order_by('-id')
    serializer_class = BookingInventoryItemSerializer
    permission_classes = [IsMarriageHallApp, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['booking', 'inventory_item']

    def get_queryset(self):
        return super().get_queryset().select_related('booking', 'inventory_item')

    def perform_destroy(self, instance):
        InventoryService.reverse_booking_allocation(instance, user=self.request.user)
        instance.delete()


class InventoryTransactionViewSet(TenantQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = InventoryTransaction.objects.all().select_related('item', 'booking', 'created_by')
    serializer_class = InventoryTransactionSerializer
    permission_classes = [IsMarriageHallApp, IsAdminOrManagerOrReadOnly, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['item', 'txn_type', 'booking']
    ordering_fields = ['created_at', 'id']
