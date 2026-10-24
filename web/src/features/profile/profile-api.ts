import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import type { UserRole } from '../auth/auth-types';
import type { ReaderNovel } from '../reader/reader-api';

export type UserProfile = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  bannerUrl: string | null;
  publishingSchedule: string | null;
  role: UserRole;
  language: string;
  notificationEnabled: boolean;
};

export type UserSettings = {
  language: string;
  notificationEnabled: boolean;
};

export type AuthorProfile = {
  authorId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  bannerUrl: string | null;
  publishingSchedule: string | null;
  joinedAt: string;
  totalViews: number;
  totalWords: number;
  followersCount: number;
  isFollowing: boolean;
  novels: Array<Pick<ReaderNovel, 'novelId' | 'title' | 'status' | 'likesCount' | 'viewsCount' | 'chaptersCount' | 'coverImageUrl' | 'genre' | 'serialStatus'>>;
};

export async function getMyProfile() {
  const response = await apiClient.get<ApiEnvelope<UserProfile>>('/users/me/profile');
  return response.data.data;
}

export async function updateMyProfile(input: { displayName?: string; bio?: string | null; avatarUrl?: string | null; bannerUrl?: string | null; publishingSchedule?: string | null }) {
  const response = await apiClient.patch<ApiEnvelope<UserProfile>>('/users/me/profile', input);
  return response.data.data;
}

export async function getMySettings() {
  const response = await apiClient.get<ApiEnvelope<UserSettings>>('/users/me/settings');
  return response.data.data;
}

export async function updateMySettings(input: { language?: string; notificationEnabled?: boolean }) {
  const response = await apiClient.patch<ApiEnvelope<UserSettings>>('/users/me/settings', input);
  return response.data.data;
}

export async function getAuthorProfile(authorId: string) {
  const response = await apiClient.get<ApiEnvelope<AuthorProfile>>(`/authors/${authorId}/profile`);
  return response.data.data;
}
