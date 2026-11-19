import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import type { AuthSession, AuthUser } from './auth-types';

export type PendingRegistration = {
  registrationId: string; email: string; expiresAt: string; resendAfterSeconds: number; resendsRemaining: number;
};

export async function login(input: { identifier: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/login', input);
  return response.data.data;
}

export async function register(input: { email: string; username: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<PendingRegistration>>('/auth/register', input);
  return response.data.data;
}

export async function resendRegistrationEmail(registrationId: string) {
  const response = await apiClient.post<ApiEnvelope<PendingRegistration>>('/auth/register/resend', { registrationId });
  return response.data.data;
}

export async function getPendingRegistration() {
  const response = await apiClient.post<ApiEnvelope<PendingRegistration | null>>('/auth/register/pending');
  return response.data.data;
}

export async function cancelRegistration(registrationId: string) {
  await apiClient.post('/auth/register/cancel', { registrationId });
}

export async function recoverRegistration(input: { token: string; username: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/register/recover', input);
  return response.data.data;
}

export async function verifyRegistration(registrationId: string, code: string) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/register/verify', { registrationId, code });
  return response.data.data;
}

export async function verifyRegistrationLink(token: string) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/register/verify-link', { token });
  return response.data.data;
}

export async function getGoogleChallenge() {
  const response = await apiClient.post<ApiEnvelope<{ clientId: string; nonce: string } | null>>('/auth/google/challenge');
  return response.data.data;
}

export async function loginWithGoogle(credential: string, password?: string) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/google', { credential, password });
  return response.data.data;
}

export async function getCurrentUser() {
  const response = await apiClient.get<ApiEnvelope<AuthUser>>('/auth/me');
  return response.data.data;
}

export async function logout() {
  const response = await apiClient.post<ApiEnvelope<{ loggedOut: boolean }>>('/auth/logout');
  return response.data.data;
}

export async function becomeAuthor() { return (await apiClient.post<ApiEnvelope<AuthSession>>('/auth/become-author')).data.data; }
