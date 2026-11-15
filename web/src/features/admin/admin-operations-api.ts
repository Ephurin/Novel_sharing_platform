import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import { useQuery } from '@tanstack/react-query';

export type Permission = 'content' | 'users' | 'finance' | 'access' | 'audit';
export type Access = { scope: string; permissions: Permission[] };
export async function adminGet<T>(path: string): Promise<T> {
  return (await apiClient.get<ApiEnvelope<T>>(path)).data.data;
}
export async function adminSend<T = unknown>(
  method: 'post' | 'patch' | 'delete',
  path: string,
  data: unknown
): Promise<T> {
  return (await apiClient.request<ApiEnvelope<T>>({ method, url: path, data })).data.data;
}
export function useAdminAccess() {
  return useQuery({
    queryKey: ['admin-access'],
    queryFn: () => adminGet<Access>('/admin/access'),
    staleTime: 15000
  });
}
export const scopeLabels: Record<string, string> = {
  SUPER_ADMIN: 'Toàn quyền',
  MODERATOR: 'Kiểm duyệt nội dung',
  USER_MANAGER: 'Quản lý người dùng',
  FINANCE: 'Tài chính'
};
export type AuditEntry = {
  audit_id: string;
  actor_username: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
  before_state: unknown;
  after_state: unknown;
};
export type Appeal = {
  review_id?: string;
  appeal_id: string;
  username: string;
  target_type: string;
  target_id: string;
  action: string;
  decision_reason: string;
  message: string;
  status: string;
  resolution: string;
  active: boolean;
  created_at: string;
};
