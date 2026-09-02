import client from './client';

const listOrData = (r) => r.data;

export const listJournalEntries = (params) =>
  client.get('/accounting/journal_entries/', { params }).then(listOrData);

export const createJournalEntry = (payload) =>
  client.post('/accounting/journal_entries/', payload).then(listOrData);

export const postJournalDraft = (id) =>
  client.post(`/accounting/journal_entries/${id}/post_entry/`).then(listOrData);

export const reverseJournalEntry = (id, payload = {}) =>
  client.post(`/accounting/journal_entries/${id}/reverse/`, payload).then(listOrData);

export const listAccounts = (params) =>
  client.get('/accounting/accounts/', { params }).then(listOrData);

export const createAccount = (payload) =>
  client.post('/accounting/accounts/', payload).then(listOrData);

export const updateAccount = (id, payload) =>
  client.patch(`/accounting/accounts/${id}/`, payload).then(listOrData);

export const deactivateAccount = (id) =>
  client.post(`/accounting/accounts/${id}/deactivate/`).then(listOrData);

export const getTrialBalance = (params) =>
  client.get('/accounting/journal_entries/trial_balance/', { params }).then(listOrData);

export const getGeneralLedger = (params) =>
  client.get('/accounting/journal_entries/general_ledger/', { params }).then(listOrData);

export const getProfitAndLoss = (params) =>
  client.get('/accounting/reports/profit_and_loss/', { params }).then(listOrData);

export const getBalanceSheet = (params) =>
  client.get('/accounting/reports/balance_sheet/', { params }).then(listOrData);

export const getCashFlow = (params) =>
  client.get('/accounting/reports/cash_flow/', { params }).then(listOrData);

export const getCashBook = (params) =>
  client.get('/accounting/reports/cash_book/', { params }).then(listOrData);

export const getBankBook = (params) =>
  client.get('/accounting/reports/bank_book/', { params }).then(listOrData);

export const getCustomerLedger = (params) =>
  client.get('/accounting/reports/customer_ledger/', { params }).then(listOrData);

export const getVendorLedger = (params) =>
  client.get('/accounting/reports/vendor_ledger/', { params }).then(listOrData);

export const getReceivables = (params) =>
  client.get('/accounting/reports/receivables/', { params }).then(listOrData);

export const getPayables = (params) =>
  client.get('/accounting/reports/payables/', { params }).then(listOrData);

export const getAccountingDashboard = (params) =>
  client.get('/accounting/reports/dashboard/', { params }).then(listOrData);

export const getIntegrityCheck = () =>
  client.get('/accounting/reports/integrity/').then(listOrData);

export const listAuditLogs = (params) =>
  client.get('/accounting/audit_logs/', { params }).then(listOrData);

export const listVendors = (params) =>
  client.get('/accounting/vendors/', { params }).then(listOrData);

export const createVendor = (payload) =>
  client.post('/accounting/vendors/', payload).then(listOrData);

export const updateVendor = (id, payload) =>
  client.patch(`/accounting/vendors/${id}/`, payload).then(listOrData);

export const listVendorBills = (params) =>
  client.get('/accounting/vendor_bills/', { params }).then(listOrData);

export const createVendorBill = (payload) =>
  client.post('/accounting/vendor_bills/', payload).then(listOrData);

export const listVendorPayments = (params) =>
  client.get('/accounting/vendor_payments/', { params }).then(listOrData);

export const createVendorPayment = (payload) =>
  client.post('/accounting/vendor_payments/', payload).then(listOrData);

export const listBankAccounts = (params) =>
  client.get('/accounting/bank_accounts/', { params }).then(listOrData);

export const createBankAccount = (payload) =>
  client.post('/accounting/bank_accounts/', payload).then(listOrData);

export const updateBankAccount = (id, payload) =>
  client.patch(`/accounting/bank_accounts/${id}/`, payload).then(listOrData);

export const createBankTransfer = (payload) =>
  client.post('/accounting/bank_transfers/', payload).then(listOrData);

export const listBankTransfers = (params) =>
  client.get('/accounting/bank_transfers/', { params }).then(listOrData);

export const listReconciliations = (params) =>
  client.get('/accounting/bank_reconciliations/', { params }).then(listOrData);

export const createReconciliation = (payload) =>
  client.post('/accounting/bank_reconciliations/', payload).then(listOrData);

export const getUnreconciled = (id) =>
  client.get(`/accounting/bank_reconciliations/${id}/unreconciled/`).then(listOrData);

export const matchReconciliation = (id, lineIds) =>
  client.post(`/accounting/bank_reconciliations/${id}/match/`, { line_ids: lineIds }).then(listOrData);

export const completeReconciliation = (id, payload = {}) =>
  client.post(`/accounting/bank_reconciliations/${id}/complete/`, payload).then(listOrData);

export const listInvoices = (params) =>
  client.get('/accounting/invoices/', { params }).then(listOrData);

export const listTaxes = (params) =>
  client.get('/accounting/taxes/', { params }).then(listOrData);

export const createTax = (payload) =>
  client.post('/accounting/taxes/', payload).then(listOrData);

export const listFiscalPeriods = (params) =>
  client.get('/accounting/fiscal_periods/', { params }).then(listOrData);

export const closeFiscalPeriod = (id) =>
  client.post(`/accounting/fiscal_periods/${id}/close/`).then(listOrData);

export const reopenFiscalPeriod = (id) =>
  client.post(`/accounting/fiscal_periods/${id}/reopen/`).then(listOrData);

export const getOpeningBalances = () =>
  client.get('/accounting/opening_balances/').then(listOrData);

export const postOpeningBalances = (payload) =>
  client.post('/accounting/opening_balances/', payload).then(listOrData);

export const listCostCenters = (params) =>
  client.get('/accounting/cost_centers/', { params }).then(listOrData);

export const createCostCenter = (payload) =>
  client.post('/accounting/cost_centers/', payload).then(listOrData);

export const updateCostCenter = (id, payload) =>
  client.patch(`/accounting/cost_centers/${id}/`, payload).then(listOrData);
