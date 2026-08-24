from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AccountViewSet, AuditLogViewSet, FiscalPeriodViewSet, JournalEntryViewSet, TaxViewSet

router = DefaultRouter()
router.register(r'accounts', AccountViewSet, basename='account')
router.register(r'taxes', TaxViewSet, basename='tax')
router.register(r'fiscal_periods', FiscalPeriodViewSet, basename='fiscal-period')
router.register(r'journal_entries', JournalEntryViewSet, basename='journal-entry')
router.register(r'audit_logs', AuditLogViewSet, basename='audit-log')

urlpatterns = [
    path('', include(router.urls)),
]
