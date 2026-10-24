import { assertActiveAccount } from '../../core/security/active-account.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import type { UpdateProfileInput, UpdateSettingsInput } from './users.schemas.js';
import {
  findProfileByUserId,
  findAuthorProfileById,
  updateProfile as updateProfileRow,
  updateSettings as updateSettingsRow
} from './users.repository.js';

export async function getPublicProfile(userId: string) {
  const profile = await findProfileByUserId(userId);

  if (!profile) {
    throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  }

  return {
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    role: profile.role
  };
}

export async function getPrivateProfile(auth: AuthContext) {
  const profile = await findProfileByUserId(auth.userId);

  if (!profile) {
    throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  }

  return profile;
}

export async function updateMyProfile(auth: AuthContext, input: UpdateProfileInput) {
  await assertActiveAccount(auth);
  await updateProfileRow(auth.userId, input);
  return getPrivateProfile(auth);
}

export async function getMySettings(auth: AuthContext) {
  const profile = await getPrivateProfile(auth);

  return {
    language: profile.language,
    notificationEnabled: profile.notificationEnabled
  };
}

export async function updateMySettings(auth: AuthContext, input: UpdateSettingsInput) {
  await updateSettingsRow(auth.userId, input);
  return getMySettings(auth);
}

export async function getAuthorProfile(authorId: string, viewerId?: string) {
  const profile = await findAuthorProfileById(authorId, viewerId);

  if (!profile) {
    throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  }

  return profile;
}
