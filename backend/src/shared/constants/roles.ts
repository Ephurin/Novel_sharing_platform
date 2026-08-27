export const userRoles = ['READER', 'AUTHOR', 'ADMIN'] as const;

export type UserRole = (typeof userRoles)[number];
