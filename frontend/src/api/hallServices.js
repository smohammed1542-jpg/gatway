import client from './client';

const unwrap = (data) => {
  const list = data?.results || data;
  return Array.isArray(list) ? list : [];
};

export const listHallServices = (params) =>
  client.get('/bookings/services/', { params }).then((r) => unwrap(r.data));

export const listHallServicesAll = () => listHallServices({ include_inactive: '1' });

export const createHallService = (payload) =>
  client.post('/bookings/services/', payload).then((r) => r.data);

export const updateHallService = (id, payload) =>
  client.patch(`/bookings/services/${id}/`, payload).then((r) => r.data);

export const deleteHallService = (id) => client.delete(`/bookings/services/${id}/`);

export const listBookingServices = (bookingId) =>
  client
    .get('/bookings/booking-services/', { params: { booking: bookingId, page_size: 1000 } })
    .then((r) => unwrap(r.data));

export const createBookingService = (payload) =>
  client.post('/bookings/booking-services/', payload).then((r) => r.data);

export const updateBookingService = (id, payload) =>
  client.patch(`/bookings/booking-services/${id}/`, payload).then((r) => r.data);

export const deleteBookingService = (id) => client.delete(`/bookings/booking-services/${id}/`);
