import type { AuthResponse } from '@tu-registry/shared';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { toApiError } from './apiError';
import { authEvents } from './authEvents';
import { tokenStore } from './tokenStore';

/** The single HTTP client of the app. */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  withCredentials: true,
  timeout: 15_000,
});

// Calls that must never trigger a token refresh themselves.
const SESSION_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout'];
// Another tab may have just rotated the session cookie; one delayed retry picks up the new one.
const REFRESH_RETRY_DELAY_MS = 300;

let refreshInFlight: Promise<AuthResponse> | null = null;

async function postRefresh() {
  const { data } = await http.post<AuthResponse>('/auth/refresh');
  tokenStore.set(data.accessToken);
  return data;
}

async function refreshWithRetry() {
  try {
    return await postRefresh();
  } catch (error) {
    if (toApiError(error).status !== 401) throw error;
    await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS));
    return postRefresh();
  }
}

/** Refreshes the session; concurrent callers share one request. */
export function refreshSession() {
  refreshInFlight ??= refreshWithRetry().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || !error.config) throw error;
  const config = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
  const { status, code } = toApiError(error);

  if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
    authEvents.emit('password-change-required');
  }

  const isSessionCall = SESSION_ENDPOINTS.some((path) => config.url?.startsWith(path));
  if (status !== 401 || isSessionCall || config._retried) throw error;

  config._retried = true;
  try {
    await refreshSession();
  } catch {
    tokenStore.set(null);
    authEvents.emit('session-ended');
    throw error;
  }
  return http(config);
});
