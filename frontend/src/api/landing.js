import axios from 'axios';
import { API_BASE } from './client';

/** Public landing CMS - no auth required. */
export const getLandingContent = () =>
  axios.get(`${API_BASE}/landing/`).then((r) => r.data);

/** Live hero metrics - polled for realtime counters. */
export const getLandingLiveStats = () =>
  axios.get(`${API_BASE}/landing/stats/`).then((r) => r.data);
