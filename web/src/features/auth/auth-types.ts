export type UserRole = 'READER' | 'AUTHOR' | 'ADMIN' | 'MODERATOR';

export const userRoles = ['READER', 'AUTHOR', 'ADMIN', 'MODERATOR'] as const;

export const readerCapabilityRoles = ['READER', 'MODERATOR'] as const;

export const authorCapabilityRoles = ['AUTHOR', 'ADMIN', 'MODERATOR'] as const;

type CapabilityBearer = { role?: UserRole | null } | UserRole | null | undefined;

function bearerRole(bearer: CapabilityBearer): UserRole | null | undefined {
  return typeof bearer === 'string' ? bearer : bearer?.role;
}

export function hasReaderCapability(bearer: CapabilityBearer) {
  const role = bearerRole(bearer);
  return role != null && (readerCapabilityRoles as readonly UserRole[]).includes(role);
}

export function hasAuthorCapability(bearer: CapabilityBearer) {
  const role = bearerRole(bearer);
  return role != null && (authorCapabilityRoles as readonly UserRole[]).includes(role);
}

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
