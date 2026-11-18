import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
export type Connection = { userId: string; username: string; displayName: string; avatarUrl: string | null; role: string; following: boolean; followedBy: boolean; mutual: boolean; bio?: string; followersCount?: number; followingCount?: number; mutualCount?: number };
export async function connections(type: string, q = '', page = 1) {
  const response = await apiClient.get<ApiEnvelope<Connection[]>>(type === 'SEARCH' ? '/users/search' : '/users/me/connections', { params: { type: type === 'SEARCH' ? undefined : type, q, page, limit: 20 } });
  return { items: response.data.data, pages: Number(response.data.meta.totalPages) || 1 };
}
export async function readerProfile(id: string) { return (await apiClient.get<ApiEnvelope<Connection>>(`/users/${encodeURIComponent(id)}/profile`)).data.data; }
export async function followReader(id: string, following: boolean) {
  if (following) await apiClient.delete(`/users/${encodeURIComponent(id)}/follow`);
  else await apiClient.post(`/users/${encodeURIComponent(id)}/follow`);
}
