import axios from 'axios';

/** The single HTTP client. Auth and error interceptors are added in stage 4. */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  withCredentials: true,
  timeout: 15_000,
});
