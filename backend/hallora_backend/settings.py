import os
from pathlib import Path
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path):
    """Load local .env into os.environ without overriding existing vars."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding='utf-8')
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, val = line.partition('=')
        key = key.strip()
        if not key:
            continue
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


_load_dotenv(BASE_DIR / '.env')
# Map alternate env names some local .env files use
if not os.environ.get('DB_NAME') and os.environ.get('DATABASE_NAME'):
    os.environ['DB_NAME'] = os.environ['DATABASE_NAME']
if not os.environ.get('DB_USER') and os.environ.get('DATABASE_USER'):
    os.environ['DB_USER'] = os.environ['DATABASE_USER']
if not os.environ.get('DB_PASSWORD') and os.environ.get('DATABASE_PASSWORD'):
    os.environ['DB_PASSWORD'] = os.environ['DATABASE_PASSWORD']
if not os.environ.get('DB_HOST') and os.environ.get('DATABASE_HOST'):
    os.environ['DB_HOST'] = os.environ['DATABASE_HOST']
if not os.environ.get('DB_PORT') and os.environ.get('DATABASE_PORT'):
    os.environ['DB_PORT'] = os.environ['DATABASE_PORT']

# Local Vite/dev escape hatch: ignore DB_* so SQLite is used
if os.environ.get('ALLOW_SQLITE', '').lower() in ('1', 'true', 'yes'):
    for _k in (
        'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DATABASE_URL',
        'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_HOST', 'DATABASE_PORT',
    ):
        os.environ.pop(_k, None)

# Quick-start development settings - unsuitable for production
import sys

_secret = os.environ.get('SECRET_KEY', '').strip()
DEBUG = os.environ.get('DEBUG', 'False') == 'True'
_running_tests = (
    os.environ.get('DJANGO_TEST', '').lower() in ('1', 'true', 'yes')
    or any(arg == 'test' or arg.endswith('pytest') for arg in sys.argv)
)
_collectstatic = any(arg == 'collectstatic' for arg in sys.argv)
if not _secret:
    if DEBUG or _running_tests or _collectstatic:
        _secret = 'django-insecure-gateway-hall-dev-only-do-not-use-in-production'
    else:
        raise RuntimeError(
            'SECRET_KEY environment variable is required when DEBUG=False. '
            'Generate a long random value and set it before starting the server.'
        )
SECRET_KEY = _secret
if (
    not DEBUG
    and not _running_tests
    and not _collectstatic
    and (
        SECRET_KEY.startswith('django-insecure-')
        or len(SECRET_KEY) < 40
    )
):
    raise RuntimeError(
        'SECRET_KEY is too weak for production (DEBUG=False). '
        'Use a long random secret (40+ characters), not a django-insecure fallback.'
    )

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]
for _railway_var in ('RAILWAY_PUBLIC_DOMAIN', 'RAILWAY_STATIC_URL'):
    _railway_domain = os.environ.get(_railway_var, '')
    if _railway_domain:
        _host = _railway_domain.replace('https://', '').replace('http://', '').split('/')[0].strip()
        if _host and _host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(_host)
if os.environ.get('RAILWAY_ENVIRONMENT') and '.up.railway.app' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('.up.railway.app')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third Party Apps
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    
    # Local Apps
    'core.apps.CoreConfig',
    'authentication.apps.AuthenticationConfig',
    'guesthouse.apps.GuesthouseConfig',
    'bookings.apps.BookingsConfig',
    'customers.apps.CustomersConfig',
    'finance.apps.FinanceConfig',
    'venues.apps.VenuesConfig',
    'inventory.apps.InventoryConfig',
    'decorations.apps.DecorationsConfig',
    'landing.apps.LandingConfig',
    'accounting.apps.AccountingConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'hallora_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, '..', 'frontend', 'dist')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'hallora_backend.wsgi.application'

# Database Setup (Supports PyInstaller dynamic writable storage)
IS_BUNDLED = getattr(sys, 'frozen', False)

if IS_BUNDLED:
    # Executable folder directory (persistent)
    EXEC_DIR = os.path.dirname(sys.executable)
    DB_PATH = os.path.join(EXEC_DIR, 'gateway_hall_database.db')
else:
    DB_PATH = BASE_DIR / 'db.sqlite3'

_require_postgres = (
    os.environ.get('REQUIRE_POSTGRES', '').lower() in ('1', 'true', 'yes')
    or (not DEBUG and not _running_tests and os.environ.get('ALLOW_SQLITE', 'false').lower() != 'true')
)

if os.environ.get('DATABASE_URL'):
    import dj_database_url

    _db_ssl_raw = os.environ.get('DB_SSL', '').strip().lower()
    if _db_ssl_raw in ('1', 'true', 'yes'):
        _db_ssl = True
    elif _db_ssl_raw in ('0', 'false', 'no'):
        _db_ssl = False
    else:
        # Railway internal Postgres often fails with forced SSL — follow URL default.
        _db_ssl = not bool(os.environ.get('RAILWAY_ENVIRONMENT'))

    DATABASES = {
        'default': dj_database_url.config(
            conn_max_age=0 if _running_tests else 600,
            ssl_require=_db_ssl and not _running_tests,
        )
    }
    if DATABASES['default'].get('ENGINE', '').endswith('sqlite3') and _require_postgres:
        raise RuntimeError(
            'DATABASE_URL resolved to SQLite but PostgreSQL is required for this environment. '
            'Set a postgres:// DATABASE_URL or DB_NAME/DB_USER/DB_PASSWORD/DB_HOST.'
        )
elif os.environ.get('DB_NAME'):
    if not os.environ.get('DB_PASSWORD') and _require_postgres and not _running_tests:
        raise RuntimeError('DB_PASSWORD is required when using PostgreSQL in production.')
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', 'localhost'),
            'PORT': os.environ.get('DB_PORT', '5432'),
            'CONN_MAX_AGE': 0 if _running_tests else 600,
        }
    }
else:
    if _require_postgres:
        raise RuntimeError(
            'PostgreSQL is required (DEBUG=False). Set DATABASE_URL or DB_NAME/DB_USER/'
            'DB_PASSWORD/DB_HOST. For local SQLite-only development set DEBUG=True or ALLOW_SQLITE=true.'
        )
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': DB_PATH,
        }
    }

# Custom User Model
AUTH_USER_MODEL = 'authentication.User'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Karachi'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
# Must be /static/ - STATIC_URL='/' breaks Django admin (/admin/css/...) and SPA routing.
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL = '/media/'
_volume_mount = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH', '').strip()
MEDIA_ROOT = _volume_mount or os.environ.get('MEDIA_ROOT', os.path.join(BASE_DIR, 'media'))
os.makedirs(MEDIA_ROOT, exist_ok=True)

# Public API base for absolute media URLs when request is unavailable (e.g. scripts)
PUBLIC_API_BASE_URL = os.environ.get('PUBLIC_API_BASE_URL', '').rstrip('/')
if not PUBLIC_API_BASE_URL:
    _railway_public = os.environ.get('RAILWAY_PUBLIC_DOMAIN', '').strip()
    if _railway_public:
        PUBLIC_API_BASE_URL = (
            _railway_public if _railway_public.startswith('http')
            else f'https://{_railway_public}'
        ).rstrip('/')

# Optional Cloudinary for persistent uploads on Railway (set CLOUDINARY_URL in env)
if os.environ.get('CLOUDINARY_URL'):
    INSTALLED_APPS = [
        *INSTALLED_APPS[:INSTALLED_APPS.index('django.contrib.staticfiles')],
        'cloudinary_storage',
        'cloudinary',
        *INSTALLED_APPS[INSTALLED_APPS.index('django.contrib.staticfiles'):],
    ]
    STORAGES = {
        'default': {
            'BACKEND': 'cloudinary_storage.storage.MediaCloudinaryStorage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
        },
    }
    DEFAULT_FILE_STORAGE = 'cloudinary_storage.storage.MediaCloudinaryStorage'
    CLOUDINARY_STORAGE = {
        'PREFIX': 'gateway/',
    }

# React build is served via /assets/ in urls.py (not collected to STATIC_ROOT).
STATICFILES_DIRS = []

STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# DRF Settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 200,
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    # DEBUG: only scoped login/register limits — dashboard polling easily
    # burns a global user budget and sticky LocMem 429s block the UI.
    'DEFAULT_THROTTLE_CLASSES': (
        (
            'rest_framework.throttling.ScopedRateThrottle',
        )
        if DEBUG
        else (
            'rest_framework.throttling.AnonRateThrottle',
            'rest_framework.throttling.UserRateThrottle',
            'rest_framework.throttling.ScopedRateThrottle',
        )
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.environ.get('DRF_THROTTLE_ANON', '60/min'),
        'user': os.environ.get('DRF_THROTTLE_USER', '1200/min'),
        'login': os.environ.get(
            'DRF_THROTTLE_LOGIN', '100/min' if DEBUG else '20/min'
        ),
        'register': os.environ.get(
            'DRF_THROTTLE_REGISTER', '50/min' if DEBUG else '10/min'
        ),
    },
}

# SimpleJWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# CORS: explicit origins from env. Optional regex for Vercel only when enabled.
_cors_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '')
if _cors_origins:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(',') if o.strip()]
else:
    CORS_ALLOWED_ORIGINS = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:8888',
        'http://127.0.0.1:8888',
        'http://localhost',
        'http://127.0.0.1',
    ]

_frontend_url = os.environ.get('FRONTEND_URL', '').strip().rstrip('/')
if _frontend_url:
    if _frontend_url not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(_frontend_url)

# Prefer setting CORS_ALLOWED_ORIGINS to the real frontend URL(s).
# On Railway, *.vercel.app is allowed by default (override with CORS_ALLOW_VERCEL_PREVIEWS=false).
CORS_ALLOWED_ORIGIN_REGEXES = []
_allow_vercel = os.environ.get('CORS_ALLOW_VERCEL_PREVIEWS', '').strip().lower()
if _allow_vercel in ('1', 'true', 'yes') or (
    _allow_vercel != 'false' and os.environ.get('RAILWAY_ENVIRONMENT')
):
    CORS_ALLOWED_ORIGIN_REGEXES = [r'^https://.*\.vercel\.app$']

# Production Gateway Centre frontend (always allow when deployed on Railway)
if os.environ.get('RAILWAY_ENVIRONMENT'):
    for _prod_origin in (
        'https://gatway-silk.vercel.app',
        'https://gatway.vercel.app',
    ):
        if _prod_origin not in CORS_ALLOWED_ORIGINS:
            CORS_ALLOWED_ORIGINS.append(_prod_origin)
CORS_ALLOW_CREDENTIALS = True

# HTTPS cookies — enable only behind TLS (Railway, production HTTPS).
# Local Docker / Windows laptop deployments should set USE_HTTPS=false.
USE_HTTPS = os.environ.get('USE_HTTPS', 'false').lower() == 'true'

_csrf_origins = os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_origins.split(',') if o.strip()] if _csrf_origins else []

if _frontend_url:
    if _frontend_url not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_frontend_url)

for _railway_var in ('RAILWAY_PUBLIC_DOMAIN', 'RAILWAY_STATIC_URL'):
    _railway_origin = os.environ.get(_railway_var, '')
    if _railway_origin:
        _origin = _railway_origin if _railway_origin.startswith('http') else f'https://{_railway_origin}'
        _origin = _origin.rstrip('/')
        if _origin not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(_origin)

for _host in ALLOWED_HOSTS:
    if _host and not _host.startswith('.'):
        _schemes = ('https',) if USE_HTTPS else ('http', 'https')
        for _scheme in _schemes:
            _origin = f'{_scheme}://{_host}'
            if _origin not in CSRF_TRUSTED_ORIGINS:
                CSRF_TRUSTED_ORIGINS.append(_origin)
        if not USE_HTTPS:
            _app_port = os.environ.get('APP_PORT', '8080').strip()
            for _port in filter(None, {_app_port, '8080', '8888', '80'}):
                _origin = f'http://{_host}:{_port}'
                if _origin not in CSRF_TRUSTED_ORIGINS:
                    CSRF_TRUSTED_ORIGINS.append(_origin)

if os.environ.get('RAILWAY_ENVIRONMENT') or (not DEBUG and USE_HTTPS):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# Full HTTPS hardening when explicitly enabled (public internet / Railway TLS).
# Disabled during `manage.py test` so APIClient HTTP requests are not 301-redirected.
if USE_HTTPS and not _running_tests:
    SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'true').lower() == 'true'
    SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
elif _running_tests:
    SECURE_SSL_REDIRECT = False

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False  # SPA may need to read CSRF cookie if cookie auth is used

# Public self-service tenant signup (creates ADMIN + new Tenant). Off by default.
ALLOW_PUBLIC_REGISTRATION = os.environ.get('ALLOW_PUBLIC_REGISTRATION', 'false').lower() == 'true'

# Upload limits (bytes)
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.environ.get('DATA_UPLOAD_MAX_MEMORY_SIZE', str(5 * 1024 * 1024)))
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.environ.get('FILE_UPLOAD_MAX_MEMORY_SIZE', str(5 * 1024 * 1024)))

WHITENOISE_USE_FINDERS = DEBUG

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': os.environ.get('LOG_LEVEL', 'INFO'),
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': os.environ.get('DJANGO_LOG_LEVEL', os.environ.get('LOG_LEVEL', 'INFO')),
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}

