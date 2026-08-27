import { apiClient, type ApiEnvelope } from './api-client';
import type { CurrentUser } from './types';

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: CurrentUser;
};

export async function login(input: { identifier: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/login', input);
  return response.data.data;
}

export async function register(input: { email: string; username: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/register', input);
  return response.data.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get<ApiEnvelope<CurrentUser>>('/auth/me');
  return response.data.data;
}
