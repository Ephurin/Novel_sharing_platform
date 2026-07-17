import type { UserRole } from '../../shared/constants/roles.js';

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DELETED';

export type AuthUser = {
  userId: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  passwordHash: string | null;
};

export type PublicAuthUser = {
  userId: string;
  email: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  status: UserStatus;
};
