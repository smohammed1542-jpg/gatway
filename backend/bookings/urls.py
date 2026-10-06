from django.urls import path, include
from rest_framework.routers import DefaultRouter, SimpleRouter
from .views import (
    BookingViewSet,
    BookingServiceViewSet,
    HallServiceViewSet,
    MarriageHallPageVisibilityView,
    MarriageHallReportsView,
)

# SimpleRouter has no API-root at ^$ — DefaultRouter would steal GET /api/bookings/.
service_router = SimpleRouter()
service_router.register(r'services', HallServiceViewSet, basename='hall-service')
service_router.register(r'booking-services', BookingServiceViewSet, basename='booking-service')

router = DefaultRouter()
router.register(r'', BookingViewSet, basename='booking')

urlpatterns = [
    path('page-visibility/', MarriageHallPageVisibilityView.as_view(), name='hall-page-visibility'),
    path('reports/', MarriageHallReportsView.as_view(), name='hall-reports'),
    path('', include(service_router.urls)),
    path('', include(router.urls)),
]
