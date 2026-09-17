import client from './client';

const unwrap = (data) => (Array.isArray(data) ? data : data?.results || data || []);

const venueRequestConfig = (payload, imageFile) => {
  if (imageFile instanceof File) {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });
    formData.append('image', imageFile);
    return {
      data: formData,
      config: { headers: { 'Content-Type': 'multipart/form-data' } },
    };
  }
  return { data: payload, config: {} };
};

export const getVenues = async (params = {}) => {
  const response = await client.get('/venues/', { params });
  return unwrap(response.data);
};

export const getVenue = async (id) => {
  const response = await client.get(`/venues/${id}/`);
  return response.data;
};

export const createVenue = (payload, imageFile) => {
  const { data, config } = venueRequestConfig(payload, imageFile);
  return client.post('/venues/', data, config).then((r) => r.data);
};

export const updateVenue = (id, payload, imageFile) => {
  const { data, config } = venueRequestConfig(payload, imageFile);
  return client.patch(`/venues/${id}/`, data, config).then((r) => r.data);
};

export const deleteVenue = async (id) => {
  const response = await client.delete(`/venues/${id}/`);
  return response.data;
};
