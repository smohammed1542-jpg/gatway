import client from './client';

export const getBookings = async (params) => {
  const response = await client.get('/bookings/', { params });
  return response.data;
};

export const getBooking = async (id) => {
  const response = await client.get(`/bookings/${id}/`);
  return response.data;
};

export const createBooking = async (data) => {
  const response = await client.post('/bookings/', data);
  return response.data;
};

export const updateBooking = async (id, data) => {
  const response = await client.put(`/bookings/${id}/`, data);
  return response.data;
};

export const deleteBooking = async (id) => {
  const response = await client.delete(`/bookings/${id}/`);
  return response.data;
};

export const cancelBooking = async (id, data = {}) => {
  const response = await client.post(`/bookings/${id}/cancel/`, data);
  return response.data;
};

export const getHallReports = (params) =>
  client.get('/bookings/reports/', { params }).then((r) => r.data);

export const getHallPageVisibility = () =>
  client.get('/bookings/page-visibility/').then((r) => r.data);
