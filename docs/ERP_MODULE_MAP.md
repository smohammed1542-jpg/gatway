# ERP Module Map — Django Apps

Mapping between Gateway Centre Django apps and ERP functional modules.

## Module overview

| ERP module | Django apps | Primary models |
|------------|-------------|----------------|
| **Administration** | `core`, `authentication` | `Tenant`, `User`, `UserSettings`, `StaffProfile` |
| **Accounting** | `accounting` | `Account`, `JournalEntry`, `JournalLine`, `FiscalPeriod`, `Vendor`, `Invoice`, `VendorBill`, `BankAccount`, `CostCenter` |
| **Sales** | `bookings`, `customers`, `decorations`, `venues` | `Booking`, `Customer`, `DecorationPackage`, `Venue` |
| **Finance ops** | `finance`, `guesthouse` | `Payment`, `Expense`, `StayBooking`, `StayPayment`, `GhExpense` |
| **Inventory** | `inventory` | `InventoryItem`, `BookingInventoryAllocation` |
| **CRM / Landing** | `landing` | Public CMS content (hero, gallery, FAQ) |
| **Reporting** | `accounting.reports`, `guesthouse` views | Trial balance, P&L, aging, GH stats |

## Data flow (finance-first)

```
Sales (Booking / Stay)
    → AccountingService.post_booking / post_stay
    → journal_entries (source_type=booking|stay)

Payments (Payment / StayPayment)
    → AccountingService.post_payment
    → journal_entries (source_type=payment)

Expenses (Expense / GhExpense)
    → AccountingService.post_expense
    → journal_entries (source_type=expense)

Inventory movements
    → InventoryService → AccountingService.post_inventory_movement
    → journal_entries (source_type=inventory)
```

## API prefixes

| Module | Base URL |
|--------|----------|
| Accounting | `/api/accounting/` |
| Finance | `/api/finance/` |
| Bookings | `/api/bookings/` |
| Customers | `/api/customers/` |
| Guest House | `/api/guesthouse/` |
| Inventory | `/api/inventory/` |
| Dashboard | `/api/dashboard/` |

## Dual-app routing (frontend)

| App type | Login portal | Default home |
|----------|--------------|--------------|
| `MARRIAGE_HALL` | `/login` | `/calendar` |
| `GUEST_HOUSE` | `/login?portal=gh` | `/gh/calendar` |

## Not in scope (future ERP modules)

- Payroll, HR, fixed assets, multi-currency, multi-company consolidation
- Maker-checker approval chains (optional via `Tenant.auto_post_journals`)

## Deprecated

- `backend/api/` — legacy duplicate; do not use. See `backend/api/DEPRECATED.md`.
