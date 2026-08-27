import axios from 'axios';

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
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1',
  timeout: 15000
});

export function setAccessToken(accessToken: string | null) {
  if (accessToken) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const envelopeError = (error.response?.data as Partial<ApiEnvelope<unknown>> | undefined)?.error;

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

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}
