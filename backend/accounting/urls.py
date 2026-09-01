from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AccountViewSet,
    AuditLogViewSet,
    BankAccountViewSet,
    BankReconciliationViewSet,
    BankTransferViewSet,
    FiscalPeriodViewSet,
    InvoiceViewSet,
    JournalEntryViewSet,
    OpeningBalanceAPIView,
    ReportAPIView,
    TaxViewSet,
    VendorBillViewSet,
    VendorPaymentViewSet,
    VendorViewSet,
)

router = DefaultRouter()
router.register(r'accounts', AccountViewSet, basename='account')
router.register(r'taxes', TaxViewSet, basename='tax')
router.register(r'fiscal_periods', FiscalPeriodViewSet, basename='fiscal-period')
router.register(r'journal_entries', JournalEntryViewSet, basename='journal-entry')
router.register(r'audit_logs', AuditLogViewSet, basename='audit-log')
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'vendor_bills', VendorBillViewSet, basename='vendor-bill')
router.register(r'vendor_payments', VendorPaymentViewSet, basename='vendor-payment')
router.register(r'bank_accounts', BankAccountViewSet, basename='bank-account')
router.register(r'bank_transfers', BankTransferViewSet, basename='bank-transfer')
router.register(r'bank_reconciliations', BankReconciliationViewSet, basename='bank-reconciliation')
router.register(r'invoices', InvoiceViewSet, basename='invoice')

urlpatterns = [
    path('reports/<str:report_name>/', ReportAPIView.as_view(), name='accounting-report'),
    path('opening_balances/', OpeningBalanceAPIView.as_view(), name='opening-balances'),
    path('', include(router.urls)),
]
