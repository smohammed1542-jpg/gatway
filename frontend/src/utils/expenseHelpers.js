export const ACCOUNT_TITLES = [
  { id: 'CAPITAL_AC', label: 'Capital A/C', category: 'OTHER', desc: 'Owner equity, investment capital, initial funds.', gl_code: '3100' },
  { id: 'CASH_AC', label: 'Cash A/C', category: 'OTHER', desc: 'Cash assets, direct office draw, liquid currency.', gl_code: '5900' },
  { id: 'ABC_VENDOR', label: 'ABC Vendor', category: 'OTHER', desc: 'Third party contractor payments & credit settlements.', gl_code: '5100' },
  { id: 'CLOTH_TABLE_CHAIRS', label: 'Cloth, Table & Chairs', category: 'MAINTENANCE', desc: 'Inventory purchases, repairs to seat linen and covers.', gl_code: '5050' },
  { id: 'DECORATION_EXP', label: 'Decoration Exp', category: 'DECORATION', desc: 'Stage design, floral sets, premium lighting, backdrops.', gl_code: '5120' },
  { id: 'DISCOUNT_RECEIVED', label: 'Discount Received', category: 'OTHER', desc: 'Deductions & savings obtained from suppliers/contractors.', gl_code: '5900' },
  { id: 'ELECTRIC_BILL_HALL', label: 'Electric Bill Hall', category: 'UTILITIES', desc: 'Grid electrical bill, commercial meter charges.', gl_code: '5020' },
  { id: 'FBR_TAX', label: 'FBR Tax Marriage Hall', category: 'OTHER', desc: 'Federal Board of Revenue tax returns & local commercial levies.', gl_code: '5900' },
  { id: 'MAINTENANCE', label: 'Marriage Hall Maintenance', category: 'MAINTENANCE', desc: 'Building paints, ceiling works, sound systems, structural fixes.', gl_code: '5050' },
  { id: 'GENERATOR_FUEL', label: 'Generator Fuel & Diesel', category: 'UTILITIES', desc: 'Diesel refills for heavy standby generators.', gl_code: '5900' },
  { id: 'STAFF_SALARY', label: 'Staff Salary', category: 'SALARY', desc: 'Monthly payments to managers, security, cleaners, & waiters.', gl_code: '5010' },
  { id: 'CATERING_KITCHEN', label: 'Catering & Kitchen Exp', category: 'CATERING', desc: 'Food items, LPG gas cylinder refills, chef daily wages.', gl_code: '5130' },
];

const CATEGORY_LABELS = {
  SALARY: 'Salary',
  UTILITIES: 'Utilities',
  DECORATION: 'Decoration',
  MAINTENANCE: 'Maintenance',
  CATERING: 'Catering',
  OTHER: 'Other',
};

export const getAccountTitleLabel = (expense) => {
  if (expense?.description?.includes('[Account Title:')) {
    const match = expense.description.match(/\[Account Title: (.*?)\]/);
    if (match?.[1]) {
      const found = ACCOUNT_TITLES.find((at) => at.id === match[1]);
      return found ? found.label : match[1];
    }
  }
  const map = {
    SALARY: 'Staff Salary',
    UTILITIES: 'Electric Bill Hall',
    DECORATION: 'Decoration Exp',
    MAINTENANCE: 'Marriage Hall Maintenance',
    CATERING: 'Catering & Kitchen Exp',
    OTHER: 'Other Miscellaneous Expenses',
  };
  return map[expense?.category] || 'Other Miscellaneous Expenses';
};

export const getAccountTitleMeta = (expense) => {
  if (expense?.description?.includes('[Account Title:')) {
    const match = expense.description.match(/\[Account Title: (.*?)\]/);
    if (match?.[1]) {
      return ACCOUNT_TITLES.find((at) => at.id === match[1]) || null;
    }
  }
  return ACCOUNT_TITLES.find((at) => at.category === expense?.category) || null;
};

export const getPayeeName = (expense) => {
  if (expense?.description?.includes('[Payee:')) {
    const match = expense.description.match(/\[Payee: (.*?)\]/);
    if (match?.[1]) return match[1];
  }
  return 'ABC Vendor';
};

export const getNotesOnly = (expense) => {
  if (!expense?.description) return '';
  return expense.description
    .replace(/\[Account Title: .*?\]/, '')
    .replace(/\[Payee: .*?\]/, '')
    .trim();
};

export const getCategoryLabel = (category) => CATEGORY_LABELS[category] || category || '-';

export const parseExpenseToForm = (expense) => {
  const accountMatch = expense.description?.match(/\[Account Title: (.*?)\]/);
  const payeeMatch = expense.description?.match(/\[Payee: (.*?)\]/);
  return {
    accountTitleId: accountMatch?.[1] || 'ELECTRIC_BILL_HALL',
    title: expense.title || '',
    payeeName: payeeMatch?.[1] || 'ABC Vendor',
    amount: String(expense.amount ?? ''),
    expense_date: expense.expense_date || new Date().toISOString().split('T')[0],
    description: getNotesOnly(expense),
  };
};
