from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InventoryItemViewSet, BookingInventoryItemViewSet, InventoryTransactionViewSet

router = DefaultRouter()
router.register(r'items', InventoryItemViewSet, basename='inventory')
router.register(r'booking-items', BookingInventoryItemViewSet, basename='booking-inventory')
router.register(r'transactions', InventoryTransactionViewSet, basename='inventory-transaction')

urlpatterns = [
    path('', include(router.urls)),
]
