"""
Legacy unscoped ViewSets — intentionally disabled.

These classes previously exposed unscoped querysets without tenant filters.
They are kept as stubs so accidental imports fail loudly instead of serving data.
Use venues/bookings/customers/finance ViewSets instead.
"""

raise ImportError(
    'backend.api.views is deprecated and disabled. '
    'Use venues, bookings, customers, finance ViewSets under /api/... instead.'
)
