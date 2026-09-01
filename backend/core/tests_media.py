"""Media authorization regression tests."""

import shutil
import tempfile
from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from PIL import Image

from authentication.models import User
from core.models import Tenant
from venues.models import Venue


def _png_bytes():
    buf = BytesIO()
    Image.new('RGB', (8, 8), color=(20, 40, 60)).save(buf, format='PNG')
    return buf.getvalue()


class ProtectedMediaTests(TestCase):
    def setUp(self):
        self._media = Path(tempfile.mkdtemp(prefix='media_test_'))
        self._override = override_settings(MEDIA_ROOT=str(self._media))
        self._override.enable()

        self.t1 = Tenant.objects.create(name='M1', subdomain='media-t1')
        self.t2 = Tenant.objects.create(name='M2', subdomain='media-t2')
        self.u1 = User.objects.create_user(
            username='media-u1', email='mu1@ex.com', password='pass12345',
            tenant=self.t1, role='ADMIN', app_type='MARRIAGE_HALL',
        )
        self.u2 = User.objects.create_user(
            username='media-u2', email='mu2@ex.com', password='pass12345',
            tenant=self.t2, role='ADMIN', app_type='MARRIAGE_HALL',
        )
        self.venue = Venue.objects.create(
            tenant=self.t1, name='Hall', location='x', capacity=10, price_per_day=1,
        )
        self.venue.image.save('hall.png', ContentFile(_png_bytes()), save=True)
        self.rel = self.venue.image.name
        self.client = APIClient()

        landing = self._media / 'landing' / 'hero'
        landing.mkdir(parents=True, exist_ok=True)
        self.public_rel = 'landing/hero/pub.png'
        (self._media / self.public_rel).write_bytes(_png_bytes())

    def tearDown(self):
        self._override.disable()
        shutil.rmtree(self._media, ignore_errors=True)

    def test_private_media_requires_auth(self):
        r = self.client.get(f'/media/{self.rel}')
        self.assertEqual(r.status_code, 403)

    def test_same_tenant_can_access_venue_image(self):
        self.client.force_login(self.u1)
        r = self.client.get(f'/media/{self.rel}')
        self.assertEqual(r.status_code, 200, getattr(r, 'content', b'')[:200])

    def test_cross_tenant_denied(self):
        self.client.force_login(self.u2)
        r = self.client.get(f'/media/{self.rel}')
        self.assertEqual(r.status_code, 403)

    def test_public_landing_allowed_anonymous(self):
        r = self.client.get(f'/media/{self.public_rel}')
        self.assertEqual(r.status_code, 200)
