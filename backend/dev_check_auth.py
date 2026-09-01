import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hallora_backend.settings')
django.setup()

from django.contrib.auth import authenticate, get_user_model

User = get_user_model()
print("Total users in DB:", User.objects.count())
for u in User.objects.all():
    print(f"User: email={u.email}, is_active={u.is_active}, role={u.role}")

# Try Django authenticate
user = authenticate(email="admin", password="admin123")
if user is not None:
    print("Django Authenticated successfully:", user.email)
else:
    print("Django Authentication failed for admin/admin123")
