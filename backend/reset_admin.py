"""
DEV ONLY — do not run against production.
Hard-coded weak passwords are intentional for local reset only.
See docs/PASSWORD_ROTATION.md
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hallora_backend.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

if os.environ.get('ALLOW_WEAK_DEV_PASSWORDS', '').lower() not in ('1', 'true', 'yes'):
    raise SystemExit(
        'Refusing to reset to a weak password. '
        'Set ALLOW_WEAK_DEV_PASSWORDS=true for local-only use, '
        'or use Staff reset-password / SEED_ADMIN_PASSWORD for installs.'
    )

u = User.objects.filter(username='admin').first()
if u:
    u.set_password('admin123')
    u.save()
    print('Updated superuser (DEV). Change password before any shared deploy.')
else:
    User.objects.create_superuser(username='admin', email='admin@localhost', password='admin123')
    print('Created superuser (DEV). Change password before any shared deploy.')
