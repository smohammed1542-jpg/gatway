"""Reset Django admin password from env (Railway / production one-off)."""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

WEAK = {'admin123', 'password', 'Password1', 'changeme', '12345678', 'gh_admin123', 'gh_staff123'}


class Command(BaseCommand):
    help = (
        'Set admin password from ADMIN_RESET_PASSWORD or SEED_ADMIN_PASSWORD env var. '
        'Example (Railway): set variable, then run: python manage.py reset_admin_password'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            default='admin',
            help='Username to reset (default: admin)',
        )

    def handle(self, *args, **options):
        username = (options['username'] or 'admin').strip()
        password = (
            os.environ.get('ADMIN_RESET_PASSWORD')
            or os.environ.get('SEED_ADMIN_PASSWORD')
            or ''
        ).strip()

        if not password or len(password) < 12 or password in WEAK:
            raise CommandError(
                'Set ADMIN_RESET_PASSWORD (or SEED_ADMIN_PASSWORD) to a strong password '
                '(12+ characters, not a common weak value).'
            )

        User = get_user_model()
        user = User.objects.filter(username=username).first()
        if not user:
            raise CommandError(f'User "{username}" not found.')

        user.set_password(password)
        if not user.is_staff:
            user.is_staff = True
        user.save(update_fields=['password', 'is_staff'] if not user.is_superuser else ['password'])

        self.stdout.write(
            self.style.SUCCESS(
                f'Password updated for "{username}". Log in at /admin/ with this username.'
            )
        )
