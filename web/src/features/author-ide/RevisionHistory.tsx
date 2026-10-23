import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Alert, Button, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { apiClient, type ApiEnvelope, getApiErrorMessage } from '../../shared/api/api-client';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';

type Revision = { revisionId: string; content: string; createdAt: string; wordCount: number };
type RevisionHistoryProps = {
  chapterId: string;
  content: string;
  onRestore: (content: string) => Promise<void>;
  onClose: () => void;
};

export async function snapshotDraft(chapterId: string, content: string) {
  return apiClient.post(`/chapters/${chapterId}/revisions/snapshot`, { content });
}

export function RevisionHistory({ chapterId, content, onRestore, onClose }: RevisionHistoryProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const revisions = useQuery({
    queryKey: ['revisions', chapterId],
    queryFn: async () => (await apiClient.get<ApiEnvelope<Revision[]>>(`/chapters/${chapterId}/revisions`)).data.data
  });
  const snapshot = useMutation({
    mutationFn: () => snapshotDraft(chapterId, content),
    onSuccess: () => revisions.refetch()
  });
  const restore = useMutation({
    mutationFn: async () => {
      const revision = revisions.data?.find(item => item.revisionId === selected);
      if (!revision) return;
      await snapshotDraft(chapterId, content);
      await onRestore(revision.content);
      onClose();
    }
  });
  const chosen = revisions.data?.find(item => item.revisionId === selected);

  return (
    <Modal opened onClose={onClose} title="Lịch sử bản thảo" size="xl">
      <Stack>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Khôi phục vào bản nháp; bản đã phát hành được giữ nguyên.</Text>
          <Button variant="light" size="xs" loading={snapshot.isPending} onClick={() => snapshot.mutate()}>Lưu mốc hiện tại</Button>
        </Group>
        {revisions.isPending && <LoadingState />}
        {revisions.isError && <ErrorState error={revisions.error} onRetry={() => void revisions.refetch()} />}
        {(snapshot.error || restore.error) && <Alert color="red">{getApiErrorMessage(snapshot.error || restore.error)}</Alert>}
        {revisions.data?.length === 0 && <Text c="dimmed">Chưa có mốc lưu. Lưu một mốc để so sánh và khôi phục sau.</Text>}
        <Select
          label="Mốc lưu"
          placeholder="Chọn phiên bản"
          value={selected}
          onChange={setSelected}
          data={(revisions.data ?? []).map(item => ({
            value: item.revisionId,
            label: `${new Date(item.createdAt).toLocaleString('vi-VN')} · ${item.wordCount} từ`
          }))}
        />
        {chosen && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Textarea label="Phiên bản đã chọn" value={chosen.content} readOnly minRows={12} maxRows={18} autosize />
              <Textarea label="Bản đang viết" value={content} readOnly minRows={12} maxRows={18} autosize />
            </SimpleGrid>
            <Button loading={restore.isPending} onClick={() => restore.mutate()}>Khôi phục bản đã chọn</Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}
