from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BookingViewSet, MarriageHallPageVisibilityView, MarriageHallReportsView

router = DefaultRouter()
router.register(r'', BookingViewSet, basename='booking')

urlpatterns = [
    path('page-visibility/', MarriageHallPageVisibilityView.as_view(), name='hall-page-visibility'),
    path('reports/', MarriageHallReportsView.as_view(), name='hall-reports'),
    path('', include(router.urls)),
]
