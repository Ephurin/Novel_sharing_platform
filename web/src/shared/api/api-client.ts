import axios from 'axios';

type ApiErrorEnvelope = {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;
};

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(input: { message: string; code: string; status: number; details?: unknown }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
  }
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1',
  withCredentials: true
});

apiClient.interceptors.request.use((config) => {
  let accessToken: string | null = null;
  try { accessToken = localStorage.getItem('ephurin_access_token'); } catch { /* Continue as guest if storage is blocked. */ }

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<ApiErrorEnvelope>(error)) {
      const status = error.response?.status ?? 0;
      const envelopeError = error.response?.data?.error;
      throw new ApiClientError({
        status,
        code: envelopeError?.code ?? (status ? `HTTP_${status}` : 'NETWORK_ERROR'),
        message: envelopeError?.message ?? error.message,
        details: envelopeError?.details
      });
    }

    throw error;
  }
);

export type ApiEnvelope<TData> = {
  success: boolean;
  data: TData;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta: Record<string, unknown>;
};

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}
