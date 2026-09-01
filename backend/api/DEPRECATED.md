"""
Legacy `api` package — DEPRECATED.

These ViewSets are NOT registered in hallora_backend.urls and must never be
mounted without TenantQuerysetMixin + role permissions.

Canonical APIs live under:
  /api/venues/, /api/bookings/, /api/customers/, /api/finance/, etc.

Do not import models/views from this package in new code.
"""
