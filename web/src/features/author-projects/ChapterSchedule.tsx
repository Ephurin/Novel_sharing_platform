import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { apiClient, getApiErrorMessage } from '../../shared/api/api-client';
import { getChapter } from '../novels/novel-api';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';

export function ChapterSchedule({ chapterId, novelId, onClose }: { chapterId: string; novelId: string; onClose: () => void }) {
  const cache = useQueryClient();
  const [date, setDate] = useState(() => {
    const next = new Date(Date.now() + 3600000);
    return new Date(next.getTime() - next.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  });
  const chapter = useQuery({ queryKey: ['schedule-draft', chapterId], queryFn: () => getChapter(chapterId), refetchOnMount: 'always' });
  const save = useMutation({
    mutationFn: async (cancel: boolean) => {
      if (cancel) return apiClient.delete(`/chapters/${chapterId}/schedule`);
      const scheduledAt = new Date(date);
      if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) throw new Error('Chọn thời gian trong tương lai');
      return apiClient.post(`/chapters/${chapterId}/schedule`, { scheduledAt: scheduledAt.toISOString(), expectedVersion: chapter.data?.draft?.version ?? 0 });
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['chapters', novelId] }),
        cache.invalidateQueries({ queryKey: ['author','chapters',novelId] }),
        cache.invalidateQueries({ queryKey: ['author','chapter',chapterId] }),
        cache.invalidateQueries({ queryKey: ['schedule-draft',chapterId] })
      ]);
      onClose();
    }
  });
  const current = chapter.data?.publicationSchedule;
  return <Modal opened onClose={() => !save.isPending && onClose()} title="Lên lịch xuất bản chương">
    <Stack>
      {chapter.isPending && <LoadingState label="Đang tải bản nháp…" />}
      {chapter.isError && <ErrorState error={chapter.error} onRetry={() => void chapter.refetch()} />}
      {chapter.data && <>
        <Text fw={600}>{chapter.data.draft?.title ?? chapter.data.title}</Text>
        {current?.status === 'PENDING' && <Text size="sm">Lịch hiện tại: {new Date(current.scheduledAt).toLocaleString('vi-VN')}</Text>}
        <TextInput type="datetime-local" label="Ngày giờ đăng" value={date} onChange={event => setDate(event.currentTarget.value)} required
          description={`Múi giờ: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Sửa bản nháp sẽ hủy lịch cũ.`} />
        <Text size="sm" c="dimmed">Tác phẩm cần được phát hành. Chương vẫn tuân theo quy trình kiểm duyệt.</Text>
        {save.isError && <Alert color="red">{getApiErrorMessage(save.error)}</Alert>}
        <Group justify="flex-end">
          {current?.status === 'PENDING' && <Button variant="subtle" color="red" disabled={save.isPending} onClick={() => save.mutate(true)}>Hủy lịch</Button>}
          <Button loading={save.isPending} disabled={!date || chapter.isFetching || !['DRAFT','REJECTED'].includes(chapter.data.status)} onClick={() => save.mutate(false)}>Lưu lịch đăng</Button>
        </Group>
      </>}
    </Stack>
  </Modal>;
}
