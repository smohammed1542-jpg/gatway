# Gateway Marriage Hall — Windows Local Deployment Guide

This guide covers installing and running the application on a **Windows client's laptop** using Docker. The database, uploaded media, and static files persist across updates and restarts.

## Architecture

```
Browser (http://localhost:8080)
        │
        ▼
┌─────────────────┐
│  frontend       │  Nginx serves React build
│  (nginx:alpine) │  Proxies /api, /admin, /media, /static → backend
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  backend        │  Django + Gunicorn
│  (python:3.12)  │  Migrations + collectstatic on start
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  db             │  PostgreSQL 16
│  (postgres:16)  │  Persistent Docker volume
└─────────────────┘
```

**Data persistence (never deleted by update scripts):**

| Data | Storage |
|------|---------|
| PostgreSQL database | Docker volume `gateway_hall_postgres_data` |
| Uploaded media files | Docker volume `gateway_hall_media_data` |
| Django static files | Docker volume `gateway_hall_static_data` |
| SQL backups | `deploy/backups/` on disk |

Application code is separate from data. Updates rebuild containers but **do not touch** the volumes above.

---

## Prerequisites (one-time on client laptop)

1. **Windows 10/11** (64-bit)
2. **Docker Desktop for Windows**
   - Download: https://www.docker.com/products/docker-desktop/
   - Enable WSL 2 backend (recommended during install)
   - Set Docker Desktop to **Start when you log in** (Settings → General)
3. **Git for Windows**
   - Download: https://git-scm.com/download/win
4. At least **4 GB RAM** free and **10 GB disk** space

---

## First-Time Installation

### Step 1: Clone the repository

Open **Command Prompt** or **PowerShell** and run:

```bat
cd C:\Apps
git clone https://github.com/YOUR_ORG/getwayhall.git
cd getwayhall
```

Replace the URL with your actual GitHub repository URL.

### Step 2: Create environment file

```bat
copy deploy\.env.example deploy\.env
notepad deploy\.env
```

Edit these required values:

| Variable | What to set |
|----------|-------------|
| `SECRET_KEY` | Long random string (see below) |
| `DB_PASSWORD` | Strong database password |
| `RUN_SEED_ON_START` | `true` for first install only |

Generate a secret key in PowerShell:

```powershell
[System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

After the first successful start, change `RUN_SEED_ON_START=false` in `deploy/.env` so admin users are not re-seeded on every restart.

### Step 3: Start the application

Double-click **`deploy\start.bat`** or run:

```bat
deploy\start.bat
```

First start takes several minutes (downloads images, installs dependencies, builds frontend).

### Step 4: Open the application

Open a browser:

```
http://localhost:8080
```

Default port is **8080** (configurable via `APP_PORT` in `deploy/.env`).

---

## Daily Use

| Action | Command |
|--------|---------|
| Start app | Double-click `deploy\start.bat` |
| Stop app | Double-click `deploy\stop.bat` |
| Update from GitHub | Double-click `deploy\update.bat` |
| Backup database | Double-click `deploy\backup_database.bat` |
| Restore database | `deploy\restore_database.bat deploy\backups\backup_hallora_YYYYMMDD_HHMMSS.sql` |

After a Windows restart, containers with `restart: unless-stopped` come back automatically **once Docker Desktop is running**.

---

## Updating the Application

The client only needs to run:

```bat
deploy\update.bat
```

This script automatically:

1. Pulls the latest code from GitHub (`GIT_BRANCH` in `deploy/.env`, default `main`)
2. Rebuilds Docker images when code or dependencies change
3. Restarts services
4. Runs Django migrations
5. Collects static files
6. Verifies backend health
7. Prints success or failure

**Your database and uploaded files are never deleted during updates.**

---

## Backup & Restore

### Automatic backup (recommended: weekly)

Run `deploy\backup_database.bat`. Backups are saved to:

```
deploy/backups/backup_hallora_YYYYMMDD_HHMMSS.sql
```

**Production requirement:** schedule this script (Windows Task Scheduler weekly, or Linux cron) — the repository does not ship an always-on scheduler daemon. Verify restore with `deploy\restore_database.bat` on a non-production copy before relying on backups.

Copy this folder to an external drive or cloud storage for disaster recovery.

### Restore from backup

```bat
deploy\restore_database.bat deploy\backups\backup_hallora_20260708_120000.sql
```

Type `YES` when prompted. This replaces the current database contents.

---

## File Structure

```
getwayhall/
├── backend/                          # Django source (unchanged by deploy scripts)
├── frontend/                         # React source (unchanged by deploy scripts)
├── deploy/
│   ├── docker-compose.yml            # Orchestrates db + backend + frontend
│   ├── .env.example                  # Template for client environment
│   ├── .env                          # Client-specific secrets (NOT in git)
│   ├── start.bat                     # Start application
│   ├── stop.bat                      # Stop application
│   ├── update.bat                    # Pull + rebuild + migrate + restart
│   ├── backup_database.bat           # pg_dump backup
│   ├── restore_database.bat          # Restore from .sql file
│   ├── backups/                      # SQL backups (gitignored)
│   ├── docker/
│   │   ├── backend/
│   │   │   ├── Dockerfile            # Django + Gunicorn image
│   │   │   └── entrypoint.sh         # Wait for DB, migrate, collectstatic, start
│   │   └── frontend/
│   │       ├── Dockerfile            # React build + Nginx image
│   │       └── nginx.conf            # Reverse proxy to Django
│   └── scripts/
│       └── powershell/               # PowerShell scripts (called by .bat files)
├── .dockerignore                     # Excludes dev files from Docker build
└── README_DEPLOYMENT.md              # This file
```

---

## Troubleshooting

### Django admin shows CSRF 403

Ensure `deploy\.env` includes (match your `APP_PORT`):

```env
CSRF_TRUSTED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://localhost,http://127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://localhost,http://127.0.0.1
```

Then restart: `deploy\start.bat`

### Docker is not running

Start **Docker Desktop** from the Start menu, wait until it shows "Running", then run `deploy\start.bat` again.

### Port already in use

Change `APP_PORT` in `deploy/.env` (e.g. `APP_PORT=8888`), then run `deploy\start.bat`.

### View logs

```bat
cd deploy
docker compose logs -f
```

Or for a single service:

```bat
docker compose logs -f backend
```

### Reset application code but keep data

```bat
deploy\update.bat
```

Never run `docker compose down -v` — the `-v` flag **deletes all volumes including the database**.

### Complete reset (deletes all client data)

Only if you intentionally want to wipe everything:

```bat
cd deploy
docker compose down -v
del .env
copy .env.example .env
```

Then edit `.env` and run `start.bat` again.

---

## Django Settings Notes

The existing `backend/hallora_backend/settings.py` supports this deployment via environment variables:

| Variable | Docker value | Purpose |
|----------|--------------|---------|
| `DB_HOST=db` | Set in compose | PostgreSQL service name |
| `DB_SSL=false` | Set in compose | Local Postgres has no SSL |
| `MEDIA_ROOT=/app/media` | Volume mounted | Persistent uploads |
| `SERVE_FRONTEND=false` | Set in compose | Nginx serves React |
| `USE_HTTPS=false` | Set in compose | HTTP cookies on localhost |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost:8080,...` | Required for Django admin login |
| `DEBUG=False` | Recommended | Production mode |

Health check endpoint: `http://localhost:8080/api/health/`

---

## Alternatives to Docker (Windows-only)

| Approach | Pros | Cons |
|----------|------|------|
| **Docker (implemented)** | Isolated, reproducible, one-command updates, PostgreSQL included, no Python/Node install on client | Requires Docker Desktop (~500 MB), WSL2 recommended |
| **PyInstaller EXE (existing `build.bat`)** | No Docker, double-click EXE | SQLite only (unless client installs Postgres manually), harder to update, large EXE, rebuild for every update |
| **Native install (Python + Node + Postgres)** | No container overhead | Client must install 3 runtimes, PATH issues, dependency conflicts, complex update scripts |
| **Electron + embedded SQLite** | Simple UX | Not PostgreSQL, limited for multi-user / large data |

**Recommendation:** Docker is the best fit for your requirements (PostgreSQL, persistent data, GitHub updates, no manual commands). The existing PyInstaller path remains available for a single-file demo but does not meet the PostgreSQL or easy-update requirements.

---

## Future: Automatic Updates

The current `update.bat` is manual. For automatic updates later, you can:

1. Schedule `deploy\update.bat` via **Windows Task Scheduler** (e.g. nightly)
2. Add a "Check for updates" button in the app that calls a small local API
3. Use a wrapper that checks GitHub releases before pulling

The Docker volume design ensures any of these approaches preserve client data.

---

## Support Checklist for Developers

Before shipping an update to the client:

- [ ] Run migrations locally and test
- [ ] Push to GitHub `main` (or client's `GIT_BRANCH`)
- [ ] Ask client to run `deploy\update.bat`
- [ ] Client should run `deploy\backup_database.bat` before major upgrades

---

## Quick Reference

```bat
REM First install
git clone <repo-url> C:\Apps\getwayhall
cd C:\Apps\getwayhall
copy deploy\.env.example deploy\.env
notepad deploy\.env
deploy\start.bat

REM Daily
deploy\start.bat

REM Update
deploy\backup_database.bat
deploy\update.bat

REM Stop
deploy\stop.bat
```
