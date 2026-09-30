import type { ApiErrorBody } from '@nexora/contracts';
import axios, { AxiosError } from 'axios';
import { session } from './session';

export const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

/** Origin of a separately hosted API (e.g. https://api.example.com), or undefined when same-origin/proxied. */
export const API_ORIGIN = /^https?:\/\//.test(API_URL) ? new URL(API_URL).origin : undefined;

/** Normalized error thrown by every API call. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: ApiErrorBody['details'] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }
}

export const apiClient = axios.create({ baseURL: API_URL, timeout: 15_000 });

apiClient.interceptors.request.use((config) => {
  const token = session.get()?.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!(error instanceof AxiosError)) return Promise.reject(error);
    if (!error.response) {
      return Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server. Check your connection and try again.'));
    }
    const body = error.response.data as Partial<ApiErrorBody> | undefined;
    const apiError = new ApiError(
      error.response.status,
      body?.code ?? 'UNKNOWN_ERROR',
      body?.message ?? 'Something went wrong. Please try again.',
      body?.details ?? [],
    );
    // An expired or revoked token ends the session; the router redirects to /login.
    if (apiError.status === 401 && error.config?.headers?.Authorization) session.clear();
    return Promise.reject(apiError);
  },
);

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
