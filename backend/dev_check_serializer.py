import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hallora_backend.settings')
django.setup()

from django.test import Client
import json

c = Client(HTTP_HOST='localhost')
response = c.post('/api/auth/login/', data=json.dumps({"email": "admin", "password": "admin123"}), content_type="application/json")
print("Login Response Status:", response.status_code)
data = json.loads(response.content.decode())
token = data.get("access")

response = c.get('/api/auth/me/', HTTP_AUTHORIZATION=f'Bearer {token}')
print("Me Response Status:", response.status_code)
print("Me Response Content:", response.content.decode())
