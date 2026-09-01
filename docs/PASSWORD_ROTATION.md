# Production / deployment password rotation (REQUIRED after first go-live)

Historical developer seed scripts used weak passwords (e.g. admin123 / gh_admin123).
Those scripts no longer seed weak passwords, but **existing databases may still
contain accounts created with them**.

## Before production traffic

1. Ensure `RUN_SEED_ON_START=false` after the first successful seed.
2. Set a strong unique `SEED_ADMIN_PASSWORD` only for the first install (never commit it).
3. Log in as each seeded admin and change the password immediately, OR use Django admin /
   Staff reset-password as an ADMIN.
4. Disable or delete unused seed accounts.
5. Confirm no login succeeds with historical weak passwords.

## Affected script names (do not use in production as-is)

- `backend/seed_db.py`
- `backend/reset_admin.py`
- `backend/create_admin_with_tenant.py`
- `backend/create_guesthouse_admin.py`
- `backend/clear_users.py`
- `backend/guesthouse/management/commands/seed_gh.py`

Prefer `seed_production_users.py` with `SEED_ADMIN_PASSWORD` for controlled installs.

This repository's local `db.sqlite3` is a development database — treat it as non-production.
