# ERP Frontend Standards — Gateway Centre

UI rules for the Hallora React frontend. See [ERP_MODULE_MAP.md](./ERP_MODULE_MAP.md) for backend mapping.

## Core principles

- Preserve existing functionality; refactor incrementally with backward compatibility.
- Analyze before changing; favor long-term architecture over cosmetic fixes.
- Never remove features unless replaced by a superior solution.

## Design philosophy

ERP-first workspace inspired by SAP Business One, Dynamics 365 Business Central, NetSuite, and ERPNext.

Prioritize: information density, minimal clicks, keyboard-first workflows, consistency, accessibility, performance, responsive layouts.

## UI guidelines

- Compact layouts with minimal whitespace.
- **Tables are the primary workspace** — use `DataTable` with `variant="erp"`.
- Sticky headers and toolbars (`ErpPageShell`, `erp-table.css`).
- Progressive disclosure; right-side summary panels where appropriate.
- Dialogs only for focused tasks (create/edit, void confirm).
- Avoid oversized cards, excessive padding, unnecessary scrolling.

## Shared components

| Component | Path | Use for |
|-----------|------|---------|
| `DataTable` | `frontend/src/components/ui/DataTable.jsx` | All list pages |
| `ErpPageShell` | `frontend/src/components/ui/ErpPageShell.jsx` | Page chrome, toolbar, KPIs |
| `AuditMeta` | `frontend/src/components/ui/AuditMeta.jsx` | Document audit trail |
| `StatusBadge` | `frontend/src/components/ui/StatusBadge.jsx` | Status columns |

Styles: `erp-table.css`, `erp-page.css`, `styles/dashboard.css`.

## Forms

- Group fields logically; validate inputs client-side where helpful.
- **Posted documents are read-only** (`COMPLETED`, `CANCELLED`, `VOIDED`, `CHECKED_OUT`).
- Void/cancel instead of delete for money records.
- Show audit fields (`created_by`, timestamps, status) on document views.
- Support attachments, comments, and activity history where the API provides them.

## Data tables

Every list page should support (via `DataTable` or page toolbar):

- Sorting (column headers)
- Filtering (toolbar / search)
- Pagination
- Column chooser (`showColumnChooser`)
- Row actions menu
- Row click → open record

Future: saved views, grouping, bulk actions, frozen columns (extend `DataTable`).

## ERP terminology

Use consistent business naming:

| Term | Notes |
|------|-------|
| Customers | Not “clients” |
| Suppliers / Vendors | AP master |
| Employees | Staff module |
| Sales Invoices | Booking/stay invoices |
| Journal Entries | GL postings |
| Inventory | Stock items |
| Cost Centers | Dimension on journal lines |

Keep product labels users know (`Bookings`, `Stays`) unless a real ERP document exists.

## Keyboard & accessibility

- `Escape` closes dialogs and dropdown menus.
- Row click opens the record; actions in row menu.
- Icon-only buttons require `aria-label`.
- Sortable columns use `aria-sort`.

## Refactoring checklist

For every page:

1. Audit the current UI.
2. Identify UX and naming issues.
3. Design an ERP layout (`ErpPageShell` + `DataTable`).
4. Rename components consistently.
5. Improve accessibility.
6. Improve performance (avoid N+1 fetches; paginate large lists).
7. Assess implementation risks.
8. Modify only required files.

## Gateway exceptions

- Dual portal: Marriage Hall (`/`) and Guest House (`/gh/`) share accounting pages with prefixed routes.
- Do not duplicate tax/overtime math in the UI — use tenant rates from the API (`utils/erp.js`).
- Landing/marketing pages may use marketing layout; operational pages use ERP workspace.
