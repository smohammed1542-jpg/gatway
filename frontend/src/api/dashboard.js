import client from './client';

export const getDashboardStats = async (params = {}) => {
  const response = await client.get('/dashboard/stats/', { params });
  return response.data;
};
