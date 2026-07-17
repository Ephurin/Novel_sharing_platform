export type UserRole = 'READER' | 'AUTHOR' | 'ADMIN';

export type AuthUser = {
  userId: string;
  email: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  status: 'ACTIVE' | 'LOCKED' | 'DELETED';
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
};
