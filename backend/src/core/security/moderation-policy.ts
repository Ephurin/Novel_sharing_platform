import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import type { UserRole } from '../../shared/constants/roles.js';

export const moderatorPermissions = [
  'publication.review',
  'comment.review',
  'report.review',
  'sanction.warn',
  'sanction.hide',
  'discussion.operate',
  'escalation.submit'
] as const;

export type ModeratorPermission = (typeof moderatorPermissions)[number] | 'selection.review' | 'placement.manage';

export function placementsEnabled() {
  return env.NOVEL_SELECTION_ENABLED && env.NOVEL_FEATURED_PLACEMENTS_ENABLED;
}

export const permissionNamespace = [
  ...moderatorPermissions,
  'discussion.configure',
  'escalation.resolve',
  'appeal.content.resolve',
  'appeal.account.resolve',
  'selection.review',
  'selection.reconsider',
  'placement.manage'
] as const;

export function moderatorPermissionsFor(role: UserRole): ModeratorPermission[] {
  if (role !== 'MODERATOR' || !env.MODERATOR_ENABLED) return [];
  const permissions: ModeratorPermission[] = [...moderatorPermissions];
  if (env.NOVEL_SELECTION_ENABLED) permissions.push('selection.review');
  if (placementsEnabled()) permissions.push('placement.manage');
  return permissions;
}

export function assertIndependentActor(
  actorId: string,
  involvedUserIds: Array<string | null | undefined>
) {
  const involved = new Set(
    involvedUserIds.filter((value): value is string => typeof value === 'string')
  );
  if (involved.has(actorId)) {
    throw new AppError(
      403,
      'MOD_CONFLICT',
      'Người xử lý đang liên quan đến nội dung này và không thể tự quyết định.'
    );
  }
}
