import { formatDateTime, formatNumber } from '../../shared/lib/format-vi';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Alert, Button, Group, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { AnimatedModal as Modal } from '../../shared/components/AnimatedModal';
import { CopyTextButton, FeedbackReveal } from '../../shared/components/ActionFeedback';
import { AnimatedSaveButton } from '../../shared/components/SaveFeedback';
import { apiClient, type ApiEnvelope, getApiErrorMessage } from '../../shared/api/api-client';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';
import './revision-history.css';

type Revision = { revisionId: string; content: string; createdAt: string; wordCount: number; sourceType?: string | null };

const sourceLabels: Record<string, string> = {
  AUTHOR_MANUAL: 'Lưu tay',
  AI_DRAFT_ACCEPT: 'Nhận bản nháp AI',
  BOOTSTRAP: 'Bản đầu tiên'
};

const countWords = (text: string) => text.trim() ? text.trim().split(/\s+/u).length : 0;
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
  const currentWords = countWords(content);

  return (
    <Modal opened onClose={() => !restore.isPending && !snapshot.isPending && onClose()} closeOnEscape={!restore.isPending && !snapshot.isPending} closeOnClickOutside={!restore.isPending && !snapshot.isPending} withCloseButton={!restore.isPending && !snapshot.isPending} title="Lịch sử bản thảo" size="xl" centered>
      <Stack>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Khôi phục vào bản nháp; bản đã phát hành được giữ nguyên.</Text>
          <AnimatedSaveButton variant="light" size="xs" loading={snapshot.isPending} saved={snapshot.isSuccess} disabled={restore.isPending} onClick={() => snapshot.mutate()}>Lưu mốc hiện tại</AnimatedSaveButton>
        </Group>
        {revisions.isPending && <LoadingState />}
        {revisions.isError && <ErrorState error={revisions.error} onRetry={() => void revisions.refetch()} />}
        {(snapshot.error || restore.error) && <Alert color="red">{getApiErrorMessage(snapshot.error || restore.error)}</Alert>}
        {snapshot.isSuccess && <Text size="sm" c="dimmed" role="status">Đã lưu mốc hiện tại vào lịch sử.</Text>}
        {revisions.data?.length === 0 && <Text c="dimmed">Chưa có mốc lưu. Lưu một mốc để so sánh và khôi phục sau.</Text>}
        {/* UI-16: a list of save points with time, size and source instead of a bare dropdown. */}
        {!!revisions.data?.length && (
          <fieldset className="sc-revision-list" disabled={restore.isPending || snapshot.isPending}>
            <legend>Mốc lưu</legend>
            {revisions.data.map((item) => {
              const delta = item.wordCount - currentWords;
              return (
                <label key={item.revisionId} className="sc-revision-item" data-selected={item.revisionId === selected || undefined}>
                  <input type="radio" name="revision" value={item.revisionId} checked={item.revisionId === selected} onChange={() => setSelected(item.revisionId)} />
                  <span className="sc-revision-time">
                    <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>{formatDateTime(item.createdAt, 'relative')}</time>
                    <small>{formatDateTime(item.createdAt)}</small>
                  </span>
                  <span className="sc-revision-meta">
                    <span>{formatNumber(item.wordCount)} từ</span>
                    <small>{delta === 0 ? 'bằng bản đang viết' : `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta))} từ so với bản đang viết`}</small>
                  </span>
                  <span className="sc-revision-source">{sourceLabels[item.sourceType ?? ''] ?? 'Mốc lưu'}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        {chosen && (
          <FeedbackReveal key={chosen.revisionId}>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Textarea label="Phiên bản đã chọn" value={chosen.content} readOnly minRows={12} maxRows={18} autosize />
              <Textarea label="Bản đang viết" value={content} readOnly minRows={12} maxRows={18} autosize />
            </SimpleGrid>
            <Group mt="sm" justify="space-between"><CopyTextButton value={chosen.content} label="Sao chép phiên bản" /><Button disabled={snapshot.isPending} loading={restore.isPending} onClick={() => restore.mutate()}>Khôi phục bản đã chọn</Button></Group>
          </FeedbackReveal>
        )}
      </Stack>
    </Modal>
  );
}
