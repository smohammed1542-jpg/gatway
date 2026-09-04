#!/bin/bash
# Do not use set -e — seed/reset failures must not block Gunicorn on Railway.

echo "==> Waiting for database..."
python <<'PY'
import os
import sys
import time

url = os.environ.get("DATABASE_URL", "").strip()
if not url:
    print("No DATABASE_URL — skipping DB wait (SQLite/local).")
    sys.exit(0)

try:
    import psycopg2
    from urllib.parse import urlparse
except ImportError:
    print("psycopg2 not available — skipping DB wait.")
    sys.exit(0)

parsed = urlparse(url)
for attempt in range(30):
    try:
        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            dbname=parsed.path.lstrip("/"),
            user=parsed.username,
            password=parsed.password,
            connect_timeout=5,
        )
        conn.close()
        print("Database is ready.")
        sys.exit(0)
    except Exception as exc:
        print(f"Database not ready ({attempt + 1}/30): {exc}")
        time.sleep(2)

print("WARNING: Database not ready after wait — continuing anyway.")
PY

echo "==> Running database migrations..."
if ! python manage.py migrate --noinput; then
    echo "WARNING: migrate failed — check DATABASE_URL and deploy logs."
fi

# Apply admin password on deploy when any of these flags is true (set SEED_ADMIN_PASSWORD on Railway).
_apply_admin=false
if [ "${APPLY_ADMIN_PASSWORD:-false}" = "true" ] \
    || [ "${RUN_SEED_ON_START:-false}" = "true" ] \
    || [ "${RESET_ADMIN_ON_START:-false}" = "true" ]; then
    _apply_admin=true
fi

if [ "$_apply_admin" = "true" ]; then
    echo "==> Applying Django admin password (SEED_ADMIN_PASSWORD)..."
    python seed_production_users.py || echo "WARNING: seed_production_users failed — set SEED_ADMIN_PASSWORD (12+ chars)."
    python manage.py reset_admin_password --username admin \
        || echo "WARNING: reset_admin_password failed for admin."
    python manage.py reset_admin_password --username gh_admin \
        || echo "WARNING: reset_admin_password failed for gh_admin (optional)."
fi

if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
    echo "==> Seeding landing page content..."
    python manage.py seed_landing || echo "WARNING: seed_landing failed."
fi

# Idempotent Pakistani demo clients for Marriage Hall + Guest House (safe to re-run).
# Set SEED_PAKISTANI_CLIENTS=false on Railway to skip.
if [ "${SEED_PAKISTANI_CLIENTS:-true}" != "false" ]; then
    echo "==> Seeding Pakistani demo clients..."
    python manage.py seed_pakistani_clients \
        || echo "WARNING: seed_pakistani_clients failed."
fi

echo "==> Ensuring media upload directory exists at ${MEDIA_ROOT:-media}..."
mkdir -p "${MEDIA_ROOT:-media}"

echo "==> Starting Gunicorn on port ${PORT:-8080}..."
exec gunicorn hallora_backend.wsgi \
    --bind "0.0.0.0:${PORT:-8080}" \
    --workers "${GUNICORN_WORKERS:-2}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile -