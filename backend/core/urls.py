from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DashboardStatsView,
    TenantDetailView,
    UserSettingsView,
    GlobalSearchView,
    AlertsView,
    NotificationLogViewSet,
    TenantBusinessDataResetView,
)

router = DefaultRouter()
router.register(r'notifications', NotificationLogViewSet, basename='notification-log')

urlpatterns = [
    path('stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('tenant/', TenantDetailView.as_view(), name='tenant-detail'),
    path('settings/', UserSettingsView.as_view(), name='user-settings'),
    path('tenant-data/', TenantBusinessDataResetView.as_view(), name='tenant-data-reset'),
    path('search/', GlobalSearchView.as_view(), name='global-search'),
    path('alerts/', AlertsView.as_view(), name='alerts'),
    path('', include(router.urls)),
]
