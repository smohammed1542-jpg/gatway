# ERP Backend & Database Standards — Gateway Centre

Enterprise ERP rules for the Gateway Marriage Hall + Guest House monorepo.
See [ERP_MODULE_MAP.md](./ERP_MODULE_MAP.md) for app-to-module mapping.

## Architecture Principles

- Design for ERP scalability and maintainability.
- Keep modules independent, reusable, and loosely coupled.
- Separate business rules (services), data models, and API layers.
- Finance-first: operational events post to the general ledger via `AccountingService` only.

## Gateway-Specific Exceptions

- **Dual product**: one codebase, two portals (`MARRIAGE_HALL` / `GUEST_HOUSE`) via `User.app_type`.
- **Multi-tenant**: every transactional row is scoped by `tenant_id` (FK to `core.Tenant`).
- **Django apps** map to ERP modules; not every SAP module exists yet (no payroll, fixed assets).

## Database Design

### Relational modeling

- Normalized design (3NF+) for transactional data.
- One business entity per table; use FKs instead of duplicating data.
- Plural `snake_case` table names via explicit `db_table` on new models.

### Primary keys & relationships

- Every table: `id` as PK.
- Foreign keys: `<entity>_id` naming (e.g. `customer_id`, `tenant_id`).
- Use FK constraints and junction tables for M2M.
- Do not store calculated relationship data that can be derived from journals.

### Master vs transaction data

| Type | Examples |
|------|----------|
| Master | `accounts`, `customers`, `vendors`, `products`, `taxes`, `fiscal_periods`, `cost_centers` |
| Transaction | `journal_entries`, `payments`, `expenses`, `bookings`, `vendor_bills`, `invoices` |

Transactions reference master data by ID.

## Accounting

- Every financial event is traceable to `journal_entries` + `journal_lines`.
- **Never overwrite posted financial history** — use reversal entries.
- Status workflow: `DRAFT` → `POSTED` → `REVERSED` / `CANCELLED`.
- Fiscal period close blocks posting into closed periods.
- Document numbers are tenant-scoped sequences (not raw PKs).

## Business logic

- Rules live in `*Service` classes under each app (`accounting/services.py`, `finance/services.py`, etc.).
- Models hold structure; views delegate to services.
- Multi-step writes use `@transaction.atomic`.
- Auto-posting from signals must call services, not create journals directly.

## API standards

- RESTful plural resources: `/api/accounting/journal_entries/`, `/api/finance/payments/`.
- Validate all inputs in serializers; authorize at service/view level.
- Paginate list endpoints; filter by tenant automatically via `TenantQuerysetMixin`.

## Data integrity & audit

Important tables include:

```
created_at, updated_at, created_by, updated_by (where applicable), status
```

- Preserve audit history; avoid hard-deleting financial records.
- Use status workflows (`Draft`, `Posted`, `Cancelled`, `Voided`) instead of destructive updates.
- `accounting.AuditLog` records POST, REVERSE, VOID, APPROVE, CLOSE actions.

## Security

- JWT authentication + role-based permissions (`ADMIN`, `MANAGER`, `STAFF`).
- Tenant isolation on all queries.
- Module-level access via `app_type` and permission classes in `core.permissions`.

## Performance

- Index FK columns and common filters (`status`, `entry_date`, `tenant_id`).
- Use `select_related` / `prefetch_related` on list views.
- Heavy reports may use pagination or background jobs in future.

## Implementation reference

| Concern | Location |
|---------|----------|
| GL posting | `backend/accounting/services.py` — `AccountingService` |
| Document sequences | `backend/accounting/sequences.py` |
| Audit mixin | `backend/core/models_base.py` |
| Tenant scoping | `backend/core/mixins.py` |
| Permissions | `backend/core/permissions.py` |
