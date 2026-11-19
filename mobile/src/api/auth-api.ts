import { apiClient, type ApiEnvelope } from './api-client';
import type { CurrentUser } from './types';

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: CurrentUser;
};

export type PendingRegistration = { registrationId: string; email: string; resendToken: string; resendAfterSeconds: number };

export async function login(input: { identifier: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/login', input);
  return response.data.data;
}

export async function register(input: { email: string; username: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<PendingRegistration>>('/auth/register/native', input);
  return response.data.data;
}

export async function resendRegistration(registration: PendingRegistration) {
  const { registrationId, resendToken } = registration;
  const response = await apiClient.post<ApiEnvelope<PendingRegistration>>('/auth/register/native/resend', { registrationId, resendToken });
  return response.data.data;
}

export async function verifyRegistration(registrationId: string, code: string) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/register/verify', { registrationId, code });
  return response.data.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get<ApiEnvelope<CurrentUser>>('/auth/me');
  return response.data.data;
}
