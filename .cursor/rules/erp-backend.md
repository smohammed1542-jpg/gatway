# ERP Backend Rules (Gateway Centre)

When changing backend code, follow [docs/ERP_STANDARDS.md](../../docs/ERP_STANDARDS.md).

## Must do

1. **GL writes** — only through `AccountingService.post_entry` / `reverse_entry` in `accounting/services.py`.
2. **Tenant scope** — every new transactional model has `tenant` FK (NOT NULL after backfill); use `TenantQuerysetMixin` on ViewSets.
3. **Immutable posted journals** — never PATCH posted `JournalEntry`; reverse and re-post.
4. **Services** — business logic in `*Service` classes, not in views or signals (signals may call services only).
5. **REST** — plural snake_case URLs; validate in serializers.
6. **Audit** — use `AuditLog.record()` for financial CREATE/POST/REVERSE/VOID; prefer `AuditedModel` for new models.
7. **Document numbers** — use `accounting.sequences.next_document_no()`, not PK-based labels.
8. **Migrations** — backward-compatible; test on PostgreSQL.

## Must not do

- Parse GL account codes from free-text descriptions.
- Hard-delete financial records; use status `VOIDED` / `CANCELLED` + journal reversal.
- Add duplicate posting paths outside `AccountingService`.
- Use `backend/api/` (deprecated).

## Module map

See [docs/ERP_MODULE_MAP.md](../../docs/ERP_MODULE_MAP.md).
