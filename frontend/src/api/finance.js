import client from './client';

export const getPayments = async (params = {}) => {
  const response = await client.get('/finance/payments/', { params });
  return response.data;
};

export const createPayment = async (data) => {
  const response = await client.post('/finance/payments/', data);
  return response.data;
};

export const getExpenses = async (params) => {
  const response = await client.get('/finance/expenses/', { params });
  return response.data;
};

export const getExpense = async (id) => {
  const response = await client.get(`/finance/expenses/${id}/`);
  return response.data;
};

export const createExpense = async (data) => {
  const response = await client.post('/finance/expenses/', data);
  return response.data;
};
