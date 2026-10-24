import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import type { AuthSession, AuthUser } from './auth-types';

export async function login(input: { identifier: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/login', input);
  return response.data.data;
}

export async function register(input: { email: string; username: string; password: string }) {
  const response = await apiClient.post<ApiEnvelope<AuthSession>>('/auth/register', input);
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
