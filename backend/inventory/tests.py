from django.test import TestCase
from rest_framework.test import APIClient

from authentication.models import User
from core.models import Tenant
from inventory.models import InventoryItem


class InventoryItemApiTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Inventory Hall', subdomain='inventory-hall')
        self.admin = User.objects.create_user(
            username='inventory-admin',
            email='inventory-admin@test.com',
            password='pass12345',
            role='ADMIN',
            tenant=self.tenant,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_create_item_and_reject_duplicate_name(self):
        payload = {
            'name': 'Chivari Chair',
            'category': 'OTHER',
            'quantity': 100,
            'unit': 'pcs',
            'price_per_unit': '250.00',
            'status': 'IN_STOCK',
        }
        created = self.client.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(created.status_code, 201)
        item = InventoryItem.objects.get(id=created.data['id'])
        self.assertEqual(item.tenant, self.tenant)
        self.assertEqual(item.quantity, 100)

        duplicate = self.client.post(
            '/api/inventory/items/',
            {**payload, 'name': 'chivari chair'},
            format='json',
        )
        self.assertEqual(duplicate.status_code, 400)
