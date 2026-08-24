"""Default chart of accounts and tax seed for a tenant."""

DEFAULT_ACCOUNTS = (
    ('1000', 'Cash', 'ASSET'),
    ('1100', 'Accounts Receivable', 'ASSET'),
    ('2100', 'Tax Payable', 'LIABILITY'),
    ('4000', 'Event Revenue', 'REVENUE'),
    ('4100', 'Stay Revenue', 'REVENUE'),
    ('5000', 'Operating Expense', 'EXPENSE'),
)

CASH = '1000'
AR = '1100'
TAX_PAYABLE = '2100'
REVENUE_EVENTS = '4000'
REVENUE_STAYS = '4100'
EXPENSE_OPS = '5000'
