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

if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
    echo "==> Seeding production admin users..."
    python seed_production_users.py || echo "WARNING: seed_production_users failed (check SEED_ADMIN_PASSWORD)."
    echo "==> Seeding landing page content..."
    python manage.py seed_landing || echo "WARNING: seed_landing failed."
fi

if [ "${RESET_ADMIN_ON_START:-false}" = "true" ]; then
    echo "==> Resetting admin password..."
    python manage.py reset_admin_password || echo "WARNING: reset_admin_password failed (check ADMIN_RESET_PASSWORD)."
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