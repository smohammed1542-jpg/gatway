"""Default chart of accounts and tax seed for a tenant."""

# (code, name, account_type)
DEFAULT_ACCOUNTS = (
    # Assets
    ('1000', 'Cash', 'ASSET'),
    ('1010', 'Bank', 'ASSET'),
    ('1100', 'Accounts Receivable', 'ASSET'),
    ('1200', 'Inventory', 'ASSET'),
    ('1900', 'Other Assets', 'ASSET'),
    # Liabilities
    ('2000', 'Accounts Payable', 'LIABILITY'),
    ('2100', 'Tax Payable', 'LIABILITY'),
    ('2200', 'Customer Advances', 'LIABILITY'),
    ('2900', 'Other Liabilities', 'LIABILITY'),
    # Equity
    ('3000', 'Owner Capital', 'EQUITY'),
    ('3100', 'Owner Drawings', 'EQUITY'),
    ('3200', 'Retained Earnings', 'EQUITY'),
    ('3900', 'Opening Balance Equity', 'EQUITY'),
    # Revenue
    ('4000', 'Hall Booking Revenue', 'REVENUE'),
    ('4010', 'Decorations Revenue', 'REVENUE'),
    ('4020', 'Catering Revenue', 'REVENUE'),
    ('4030', 'Other Service Revenue', 'REVENUE'),
    ('4100', 'Stay Revenue', 'REVENUE'),
    ('4900', 'Other Income', 'REVENUE'),
    ('4950', 'Discount Allowed', 'REVENUE'),
    # Expenses
    ('5000', 'Operating Expense', 'EXPENSE'),
    ('5010', 'Salaries', 'EXPENSE'),
    ('5020', 'Electricity', 'EXPENSE'),
    ('5030', 'Gas', 'EXPENSE'),
    ('5040', 'Water', 'EXPENSE'),
    ('5050', 'Maintenance', 'EXPENSE'),
    ('5060', 'Cleaning', 'EXPENSE'),
    ('5070', 'Marketing', 'EXPENSE'),
    ('5080', 'Office Expense', 'EXPENSE'),
    ('5090', 'Rent', 'EXPENSE'),
    ('5100', 'Purchases', 'EXPENSE'),
    ('5110', 'Inventory Expense', 'EXPENSE'),
    ('5120', 'Decoration Expense', 'EXPENSE'),
    ('5130', 'Catering Expense', 'EXPENSE'),
    ('5900', 'Other Expenses', 'EXPENSE'),
)

# System account code constants
CASH = '1000'
BANK = '1010'
AR = '1100'
INVENTORY = '1200'
AP = '2000'
TAX_PAYABLE = '2100'
CUSTOMER_ADVANCES = '2200'
OWNER_CAPITAL = '3000'
OWNER_DRAWINGS = '3100'
RETAINED_EARNINGS = '3200'
OPENING_EQUITY = '3900'
REVENUE_EVENTS = '4000'  # Hall booking (legacy alias)
REVENUE_HALL = '4000'
REVENUE_DECORATION = '4010'
REVENUE_CATERING = '4020'
REVENUE_OTHER_SERVICE = '4030'
REVENUE_STAYS = '4100'
DISCOUNT_ALLOWED = '4950'
EXPENSE_OPS = '5000'
EXPENSE_SALARIES = '5010'
EXPENSE_ELECTRICITY = '5020'
EXPENSE_GAS = '5030'
EXPENSE_WATER = '5040'
EXPENSE_MAINTENANCE = '5050'
EXPENSE_CLEANING = '5060'
EXPENSE_MARKETING = '5070'
EXPENSE_OFFICE = '5080'
EXPENSE_RENT = '5090'
EXPENSE_PURCHASES = '5100'
EXPENSE_INVENTORY = '5110'
EXPENSE_DECORATION = '5120'
EXPENSE_CATERING = '5130'
EXPENSE_OTHER = '5900'

# Map finance.Expense.category → default GL expense code
CATEGORY_TO_EXPENSE_ACCOUNT = {
    'SALARY': EXPENSE_SALARIES,
    'UTILITIES': EXPENSE_ELECTRICITY,
    'DECORATION': EXPENSE_DECORATION,
    'MAINTENANCE': EXPENSE_MAINTENANCE,
    'CATERING': EXPENSE_CATERING,
    'OTHER': EXPENSE_OTHER,
}

# Map frontend account-title ids → GL codes (expense side)
ACCOUNT_TITLE_TO_GL = {
    'CAPITAL_AC': OWNER_DRAWINGS,
    'CASH_AC': EXPENSE_OTHER,
    'ABC_VENDOR': EXPENSE_PURCHASES,
    'CLOTH_TABLE_CHAIRS': EXPENSE_MAINTENANCE,
    'DECORATION_EXP': EXPENSE_DECORATION,
    'DISCOUNT_RECEIVED': EXPENSE_OTHER,
    'ELECTRIC_BILL_HALL': EXPENSE_ELECTRICITY,
    'FBR_TAX': EXPENSE_OTHER,
    'MAINTENANCE': EXPENSE_MAINTENANCE,
    'GENERATOR_FUEL': EXPENSE_OTHER,
    'STAFF_SALARY': EXPENSE_SALARIES,
    'CATERING_KITCHEN': EXPENSE_CATERING,
}

SYSTEM_ACCOUNT_CODES = frozenset(code for code, _name, _type in DEFAULT_ACCOUNTS)
