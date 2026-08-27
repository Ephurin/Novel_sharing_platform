import { apiClient, type ApiEnvelope } from './api-client';

export type UserProfile = {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
};

export async function getMyProfile() {
  const response = await apiClient.get<ApiEnvelope<UserProfile>>('/users/me/profile');
  return response.data.data;
}

export async function updateMyProfile(input: Pick<UserProfile, 'displayName' | 'avatarUrl' | 'bio'>) {
  const response = await apiClient.patch<ApiEnvelope<UserProfile>>('/users/me/profile', input);
  return response.data.data;
}
