import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1',
  withCredentials: true
});

apiClient.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('ephurin_access_token');

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

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
