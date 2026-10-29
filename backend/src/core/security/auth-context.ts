import type { UserRole } from '../../shared/constants/roles.js';

export type AuthContext = {
  userId: string;
  role: UserRole;
  tokenId?: string;
  adminScope?: 'SUPER_ADMIN' | 'MODERATOR' | 'USER_MANAGER' | 'FINANCE';
};

// Admin privilege requires an explicit entitlement, including internal service contexts.
export function isContentAdmin(auth: AuthContext) {
  return (
    auth.role === 'ADMIN' && (auth.adminScope === 'SUPER_ADMIN' || auth.adminScope === 'MODERATOR')
  );
}
