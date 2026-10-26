import type { UserRole } from '../../shared/constants/roles.js';

export type AuthContext = {
  userId: string;
  role: UserRole;
  tokenId?: string;
  adminScope?: 'SUPER_ADMIN'|'MODERATOR'|'USER_MANAGER'|'FINANCE';
};

// Undefined scope is reserved for trusted internal contexts; HTTP identities always load it.
export function isContentAdmin(auth:AuthContext) {
  return auth.role==='ADMIN'&&(!auth.adminScope||auth.adminScope==='SUPER_ADMIN'||auth.adminScope==='MODERATOR');
}
