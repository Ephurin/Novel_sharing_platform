import { Modal } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import { AdminError } from './AdminShared';
import { LoadingState } from '../../shared/components/PageStates';

export function AdminChapterPreview({ chapterId, onClose }: { chapterId: string | null; onClose: () => void }) {
  const query = useQuery({queryKey:['admin-chapter',chapterId],enabled:!!chapterId,queryFn:async () => (await apiClient.get<ApiEnvelope<{title:string;content:string|null}>>(`/admin/chapters/${chapterId}`)).data.data});
  return <Modal opened={!!chapterId} onClose={onClose} title={query.data?.title || 'Nội dung chương'} size="xl"><AdminError error={query.error} />{query.isLoading && <LoadingState label="Đang tải nội dung..." />}<div className="admin-prose">{query.data?.content || (!query.isLoading && !query.isError ? 'Chưa có nội dung chương đã lưu.' : '')}</div></Modal>;
}
