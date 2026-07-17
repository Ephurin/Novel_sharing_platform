import type { UserRole } from '../../shared/constants/roles.js';

export type AuthContext = {
  userId: string;
  role: UserRole;
  tokenId?: string;
};
