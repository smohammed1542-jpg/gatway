"""Authorized media serving for local filesystem storage."""

import os
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseForbidden
from django.views.decorators.http import require_GET
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

# Marketing / public landing assets (no auth).
PUBLIC_MEDIA_PREFIXES = (
    'landing/',
)

# Tenant-scoped uploads (auth required + tenant match).
PRIVATE_MEDIA_PREFIXES = (
    'avatars/',
    'venues/',
    'gh_rooms/',
    'gh_unit_media/',
)


def _normalize_rel_path(path: str) -> str:
    cleaned = (path or '').replace('\\', '/').lstrip('/')
    if not cleaned or '..' in cleaned.split('/'):
        raise Http404('Not found')
    return cleaned


def _authenticate(request):
    """Prefer session user; accept JWT via Authorization or short-lived ?access= for <img>."""
    user = getattr(request, 'user', None)
    if user is not None and getattr(user, 'is_authenticated', False):
        return user
    try:
        auth = JWTAuthentication().authenticate(request)
        if auth:
            return auth[0]
    except AuthenticationFailed:
        pass
    # <img src> cannot send Authorization headers — allow bearer token in query.
    raw = (request.GET.get('access') or '').strip()
    if raw:
        try:
            validated = JWTAuthentication().get_validated_token(raw)
            return JWTAuthentication().get_user(validated)
        except Exception:
            return None
    return None


def _tenant_owns_file(user, rel_path: str) -> bool:
    """Resolve ownership of a stored media path for the authenticated user."""
    if user.is_superuser and not user.tenant_id:
        return True
    tenant_id = getattr(user, 'tenant_id', None)
    if not tenant_id:
        return False

    name = rel_path

    if rel_path.startswith('avatars/'):
        from authentication.models import User
        owner = User.objects.filter(profile_picture=name).only('id', 'tenant_id').first()
        if not owner:
            return False
        return owner.id == user.id or owner.tenant_id == tenant_id

    if rel_path.startswith('venues/'):
        from venues.models import Venue
        return Venue.objects.filter(image=name, tenant_id=tenant_id).exists()

    if rel_path.startswith('gh_rooms/'):
        from guesthouse.models import Room
        return Room.objects.filter(image=name, tenant_id=tenant_id).exists()

    if rel_path.startswith('gh_unit_media/'):
        from guesthouse.models import UnitMedia
        return UnitMedia.objects.filter(file=name, unit__tenant_id=tenant_id).exists()

    return False


@require_GET
def serve_protected_media(request, path):
    """
    Serve MEDIA_ROOT files with access rules:
    - landing/* : public
    - avatars, venues, gh_* : authenticated + same tenant (or owner)
    - unknown prefixes : deny (fail closed)
    """
    if os.environ.get('CLOUDINARY_URL'):
        # Absolute Cloudinary URLs are used; local /media/ should not expose files.
        raise Http404('Not found')

    rel = _normalize_rel_path(path)
    is_public = any(rel.startswith(p) for p in PUBLIC_MEDIA_PREFIXES)
    is_private = any(rel.startswith(p) for p in PRIVATE_MEDIA_PREFIXES)

    if not is_public and not is_private:
        return HttpResponseForbidden('Forbidden')

    if is_private:
        user = _authenticate(request)
        if user is None:
            return HttpResponseForbidden('Authentication required')
        if not _tenant_owns_file(user, rel):
            return HttpResponseForbidden('Forbidden')

    root = Path(settings.MEDIA_ROOT).resolve()
    abs_path = (root / rel).resolve()
    try:
        abs_path.relative_to(root)
    except ValueError as exc:
        raise Http404('Not found') from exc
    if not abs_path.is_file():
        raise Http404('Not found')

    return FileResponse(open(abs_path, 'rb'), as_attachment=False)
