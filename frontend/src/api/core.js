import client from './client';

export const getTenant = () => client.get('/dashboard/tenant/').then((r) => r.data);
export const updateTenant = (data) => client.patch('/dashboard/tenant/', data).then((r) => r.data);

export const getUserSettings = () => client.get('/dashboard/settings/').then((r) => r.data);
export const updateUserSettings = (data) => client.patch('/dashboard/settings/', data).then((r) => r.data);

export const globalSearch = (q) =>
  client.get('/dashboard/search/', { params: { q } }).then((r) => r.data);

export const getAlerts = () => client.get('/dashboard/alerts/').then((r) => r.data);
