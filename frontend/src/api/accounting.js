import client from './client';

export const listJournalEntries = (params) =>
  client.get('/accounting/journal_entries/', { params }).then((r) => r.data);

export const listAccounts = (params) =>
  client.get('/accounting/accounts/', { params }).then((r) => r.data);

export const getTrialBalance = (params) =>
  client.get('/accounting/journal_entries/trial_balance/', { params }).then((r) => r.data);

export const listAuditLogs = (params) =>
  client.get('/accounting/audit_logs/', { params }).then((r) => r.data);
