from django.core.management.base import BaseCommand

from accounting.services import AccountingService
from bookings.models import Booking
from core.models import Tenant
from finance.models import Expense, Payment
from guesthouse.models import GhExpense, StayBooking, StayPayment


class Command(BaseCommand):
    help = 'Backfill accounting journals from existing bookings, payments, expenses, and stays.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', type=int, help='Limit to a tenant id')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        tenants = Tenant.objects.all()
        if options.get('tenant'):
            tenants = tenants.filter(pk=options['tenant'])
        dry = options.get('dry_run')
        summary = {
            'bookings': 0, 'payments': 0, 'expenses': 0,
            'stays': 0, 'stay_payments': 0, 'gh_expenses': 0,
            'skipped': 0, 'errors': [],
        }

        for tenant in tenants:
            AccountingService.ensure_chart(tenant)
            self.stdout.write(f'Tenant {tenant.pk} {tenant.name}')

            for booking in Booking.objects.filter(tenant=tenant):
                try:
                    if AccountingService.find_posted(tenant, 'booking', booking.pk):
                        summary['skipped'] += 1
                        continue
                    if dry:
                        continue
                    if booking.booking_status in ('CONFIRMED', 'COMPLETED'):
                        AccountingService.post_booking_invoice(booking)
                        summary['bookings'] += 1
                    elif booking.booking_status == 'CANCELLED':
                        summary['skipped'] += 1
                except Exception as exc:
                    summary['errors'].append(f'booking {booking.pk}: {exc}')

            for payment in Payment.objects.filter(tenant=tenant, status='COMPLETED'):
                try:
                    if AccountingService.find_posted(tenant, 'payment', payment.pk):
                        summary['skipped'] += 1
                        continue
                    if dry:
                        continue
                    AccountingService.post_payment(payment)
                    summary['payments'] += 1
                except Exception as exc:
                    summary['errors'].append(f'payment {payment.pk}: {exc}')

            for expense in Expense.objects.filter(tenant=tenant).exclude(status='CANCELLED'):
                try:
                    if AccountingService.find_posted(tenant, 'expense', expense.pk):
                        summary['skipped'] += 1
                        continue
                    if dry:
                        continue
                    AccountingService.post_expense(expense)
                    summary['expenses'] += 1
                except Exception as exc:
                    summary['errors'].append(f'expense {expense.pk}: {exc}')

            for stay in StayBooking.objects.filter(tenant=tenant):
                try:
                    if AccountingService.find_posted(tenant, 'stay', stay.pk):
                        summary['skipped'] += 1
                        continue
                    if dry:
                        continue
                    if stay.status not in ('PENDING', 'CANCELLED'):
                        AccountingService.post_stay_invoice(stay)
                        summary['stays'] += 1
                except Exception as exc:
                    summary['errors'].append(f'stay {stay.pk}: {exc}')

            for sp in StayPayment.objects.filter(tenant=tenant, status='COMPLETED'):
                try:
                    if AccountingService.find_posted(tenant, 'stay_payment', sp.pk):
                        summary['skipped'] += 1
                        continue
                    if dry:
                        continue
                    AccountingService.post_stay_payment(sp)
                    summary['stay_payments'] += 1
                except Exception as exc:
                    summary['errors'].append(f'stay_payment {sp.pk}: {exc}')

            for ge in GhExpense.objects.filter(tenant=tenant).exclude(status='CANCELLED'):
                try:
                    if AccountingService.find_posted(tenant, 'gh_expense', ge.pk):
                        summary['skipped'] += 1
                        continue
                    if dry:
                        continue
                    AccountingService.post_expense(ge, source_type='gh_expense')
                    summary['gh_expenses'] += 1
                except Exception as exc:
                    summary['errors'].append(f'gh_expense {ge.pk}: {exc}')

        self.stdout.write(self.style.SUCCESS(str(summary)))
        for err in summary['errors']:
            self.stdout.write(self.style.WARNING(err))
