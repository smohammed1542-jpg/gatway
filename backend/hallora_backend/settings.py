import os
from pathlib import Path
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Quick-start development settings - unsuitable for production
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-gateway-hall-fallback-key-2024')
DEBUG = os.environ.get('DEBUG', 'False') == 'True'
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
import sys
IS_BUNDLED = getattr(sys, 'frozen', False)

if IS_BUNDLED:
    # Executable folder directory (persistent)
    EXEC_DIR = os.path.dirname(sys.executable)
    DB_PATH = os.path.join(EXEC_DIR, 'gateway_hall_database.db')
else:
    DB_PATH = BASE_DIR / 'db.sqlite3'

if os.environ.get('DATABASE_URL'):
    import dj_database_url

    DATABASES = {
        'default': dj_database_url.config(
            default=f'sqlite:///{DB_PATH}',
            conn_max_age=600,
            ssl_require=os.environ.get('DB_SSL', 'true').lower() == 'true',
        )
    }
elif os.environ.get('DB_NAME'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', 'localhost'),
            'PORT': os.environ.get('DB_PORT', '5432'),
        }
    }
else:
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
}

# SimpleJWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# CORS Settings
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

# Allow any Vercel preview/production frontend without manual env updates.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https://.*\.vercel\.app$',
]
CORS_ALLOW_CREDENTIALS = True

# HTTPS cookies — enable only behind TLS (Railway, production HTTPS).
# Local Docker / Windows laptop deployments should set USE_HTTPS=false.
USE_HTTPS = os.environ.get('USE_HTTPS', 'false').lower() == 'true'

_csrf_origins = os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_origins.split(',') if o.strip()] if _csrf_origins else []

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

