from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
import os
from django.http import HttpResponse, JsonResponse
from django.views.static import serve
from django.contrib.staticfiles.views import serve as staticfiles_serve
from django.views.decorators.cache import never_cache

FRONTEND_DIST = os.path.normpath(os.path.join(settings.BASE_DIR, '..', 'frontend', 'dist'))
FRONTEND_ASSETS = os.path.join(FRONTEND_DIST, 'assets')
FRONTEND_INDEX = os.path.join(FRONTEND_DIST, 'index.html')


def serve_static_files(request, path):
    return staticfiles_serve(request, path, insecure=True)


def serve_react(request):
    dist_index = FRONTEND_INDEX
    if not os.path.exists(dist_index):
        dist_index = os.path.join(settings.STATIC_ROOT, 'index.html')

    if os.path.exists(dist_index):
        with open(dist_index, 'r', encoding='utf-8') as f:
            return HttpResponse(f.read(), content_type='text/html')
    return HttpResponse("React production build index.html not found. Please build frontend first.", status=404)


def api_root(request):
    return JsonResponse({
        'name': 'Gateway Marriage Hall API',
        'status': 'ok',
        'health': '/api/health/',
        'auth': '/api/auth/token/',
        'landing': '/api/landing/',
        'admin': '/admin/',
        'endpoints': {
            'auth': '/api/auth/',
            'dashboard': '/api/dashboard/',
            'venues': '/api/venues/',
            'bookings': '/api/bookings/',
            'customers': '/api/customers/',
            'finance': '/api/finance/',
            'inventory': '/api/inventory/',
            'decorations': '/api/decorations/',
            'guesthouse': '/api/guesthouse/',
            'landing': '/api/landing/',
            'accounting': '/api/accounting/',
        },
        'message': 'API server running. Frontend is on Vercel.',
    })


def health_check(request):
    from django.db import connection

    db_status = 'ok'
    try:
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:
        db_status = 'unavailable'

    payload = {
        'status': 'ok' if db_status == 'ok' else 'degraded',
        'database': db_status,
        'service': 'gateway-hall-api',
    }
    return JsonResponse(payload, status=200 if db_status == 'ok' else 503)


def api_not_found(request):
    return JsonResponse({
        'detail': 'Not found. This server only hosts the API. Use /api/... or open the Vercel frontend URL.',
    }, status=404)


def _should_serve_frontend():
    flag = os.environ.get('SERVE_FRONTEND', 'auto').strip().lower()
    if flag == 'false':
        return False
    if flag == 'true':
        return True
    return os.path.exists(FRONTEND_INDEX)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check),
    path('api/auth/', include('authentication.urls')),
    path('api/dashboard/', include('core.urls')),
    path('api/core/', include('core.urls')),
    path('api/venues/', include('venues.urls')),
    path('api/bookings/', include('bookings.urls')),
    path('api/customers/', include('customers.urls')),
    path('api/finance/', include('finance.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/decorations/', include('decorations.urls')),
    path('api/guesthouse/', include('guesthouse.urls')),
    path('api/landing/', include('landing.urls')),
    path('api/accounting/', include('accounting.urls')),
]

urlpatterns += [
    re_path(
        r'^media/(?P<path>.*)$',
        serve,
        {'document_root': settings.MEDIA_ROOT},
    ),
]

if _should_serve_frontend():
    # Static frontend build + SPA catch-all (single-server / local prod)
    urlpatterns += [
        re_path(
            r'^static/(?P<path>.*)$',
            never_cache(serve_static_files),
        ),
        re_path(
            r'^assets/(?P<path>.*)$',
            serve,
            {'document_root': FRONTEND_ASSETS},
        ),
        re_path(
            r'^(?P<path>favicon\.svg|hero\.png|icons\.svg)$',
            serve,
            {'document_root': FRONTEND_DIST},
        ),
        re_path(r'^.*$', serve_react, name='react-app'),
    ]
else:
    # API-only deploy (Railway backend + Vercel frontend)
    urlpatterns += [
        re_path(
            r'^static/(?P<path>.*)$',
            never_cache(serve_static_files),
        ),
        path('', api_root),
        path('api/', api_root),
        re_path(r'^.*$', api_not_found),
    ]

