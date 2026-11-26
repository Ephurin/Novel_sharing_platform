export const userRoles = ['READER', 'AUTHOR', 'ADMIN', 'MODERATOR'] as const;

export type UserRole = (typeof userRoles)[number];

export const readerCapabilityRoles = ['READER', 'MODERATOR'] as const;

export const authorCapabilityRoles = ['AUTHOR', 'ADMIN', 'MODERATOR'] as const;

export function hasReaderCapability(role: UserRole) {
  return (readerCapabilityRoles as readonly UserRole[]).includes(role);
}

export function hasAuthorCapability(role: UserRole) {
  return (authorCapabilityRoles as readonly UserRole[]).includes(role);
}
