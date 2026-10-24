import { ChapterSchedule } from './ChapterSchedule';
import { useState } from 'react';
import { ActionIcon, Alert, Button, Group, Menu, Modal, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiErrorMessage } from '../../shared/api/api-client';
import { getChapter, submitChapterPublish, updateChapter } from '../novels/novel-api';
import type { Chapter } from '../novels/novel-types';
import { RevisionHistory } from '../author-ide/RevisionHistory';

type ChapterAction = 'pricing' | 'publish' | 'archive' | 'restore' | 'delete';

export function ChapterActions({ chapter }: { chapter: Chapter }) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const cache = useQueryClient();
  const [action, setAction] = useState<ChapterAction | null>(null);
  const [vip, setVip] = useState(chapter.isVip);
  const [price, setPrice] = useState(chapter.priceCoins || 1);
  const mutation = useMutation({
    mutationFn: async () => {
      if (action === 'pricing') await updateChapter(chapter.chapterId, { isVip: vip, priceCoins: vip ? price : 0 });
      else if (action === 'publish') await submitChapterPublish(chapter.chapterId);
      else if (action === 'delete') await apiClient.delete(`/chapters/${chapter.chapterId}`);
      else await apiClient.post(`/chapters/${chapter.chapterId}/${action}`);
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['chapters', chapter.novelId] });
      await cache.invalidateQueries({ queryKey: ['novel', chapter.novelId] });
      setAction(null);
    }
  });
  const confirmation = action === 'publish'
    ? 'Gửi bản nháp đã lưu để phát hành? Nội dung có thể cần kiểm duyệt.'
    : action === 'delete'
      ? 'Xóa chương đã lưu trữ? Chương sẽ được gỡ khỏi danh sách.'
      : action === 'restore'
        ? 'Khôi phục chương vào bản nháp để tiếp tục chỉnh sửa?'
        : 'Lưu trữ sẽ gỡ chương khỏi trang đọc. Chương đã có độc giả mở khóa sẽ được bảo vệ.';

  return (
    <>
      <Menu withinPortal position="bottom-end">
        <Menu.Target><ActionIcon variant="subtle" aria-label={`Thao tác chương ${chapter.chapterNumber}`}>⋮</ActionIcon></Menu.Target>
        <Menu.Dropdown>
          {chapter.status === 'ARCHIVED' ? (
            <>
              <Menu.Item onClick={() => setAction('restore')}>Khôi phục bản nháp</Menu.Item>
              <Menu.Item color="red" onClick={() => setAction('delete')}>Xóa chương</Menu.Item>
            </>
          ) : (
            <>
              <Menu.Item onClick={() => { setVip(chapter.isVip); setPrice(chapter.priceCoins || 1); setAction('pricing'); }}>Quyền đọc &amp; giá xu</Menu.Item>
              {['DRAFT','REJECTED'].includes(chapter.status) && <Menu.Item onClick={() => setScheduleOpen(true)}>Lên lịch xuất bản</Menu.Item>}
              <Menu.Item onClick={() => setAction('publish')}>Gửi phát hành</Menu.Item>
              <Menu.Item onClick={() => setAction('archive')}>Lưu trữ chương</Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      {scheduleOpen && <ChapterSchedule chapterId={chapter.chapterId} novelId={chapter.novelId} onClose={() => setScheduleOpen(false)} />}
      <Modal opened={Boolean(action)} onClose={() => !mutation.isPending && setAction(null)} title="Xác nhận thao tác">
        <Stack>
          {action === 'pricing' ? (
            <>
              <Switch label="Chương VIP" checked={vip} onChange={event => setVip(event.currentTarget.checked)} />
              {vip && <NumberInput label="Giá xu" min={1} max={1000000} allowDecimal={false} value={price} onChange={value => setPrice(Number(value) || 1)} />}
            </>
          ) : <Text>{confirmation}</Text>}
          {mutation.isError && <Alert color="red">{getApiErrorMessage(mutation.error)}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAction(null)} disabled={mutation.isPending}>Hủy</Button>
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>Xác nhận</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export function ChapterOrder({ novelId, chapters, onClose }: { novelId: string; chapters: Chapter[]; onClose: () => void }) {
  const [items, setItems] = useState(chapters);
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: () => apiClient.put(`/novels/${novelId}/chapter-order`, { chapterIds: items.map(item => item.chapterId) }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['chapters', novelId] });
      onClose();
    }
  });
  function move(index: number, step: number) {
    setItems(old => {
      const next = [...old];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  }
  return (
    <Modal opened onClose={onClose} title="Sắp xếp chương" size="lg">
      <Stack>
        {items.map((item, index) => (
          <Group key={item.chapterId} wrap="nowrap">
            <Text style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{index + 1}. {item.title}</Text>
            <ActionIcon variant="default" disabled={index === 0 || save.isPending} aria-label={`Đưa lên: ${item.title}`} onClick={() => move(index, -1)}>↑</ActionIcon>
            <ActionIcon variant="default" disabled={index === items.length - 1 || save.isPending} aria-label={`Đưa xuống: ${item.title}`} onClick={() => move(index, 1)}>↓</ActionIcon>
          </Group>
        ))}
        {save.isError && <Alert color="red">{getApiErrorMessage(save.error)}</Alert>}
        <Button loading={save.isPending} onClick={() => save.mutate()}>Lưu thứ tự</Button>
      </Stack>
    </Modal>
  );
}

export function ChapterHistoryPanel({ chapters }: { chapters: Chapter[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const chapter = useQuery({
    queryKey: ['history-draft', selected],
    queryFn: () => getChapter(selected!),
    enabled: Boolean(selected)
  });
  return (
    <Stack p="md">
      <Select label="Lịch sử bản thảo theo chương" placeholder="Chọn chương" value={selected} onChange={setSelected}
        data={chapters.filter(item => item.status !== 'ARCHIVED').map(item => ({ value: item.chapterId, label: item.title }))} />
      <Button variant="light" disabled={!chapter.data} onClick={() => setOpened(true)}>Xem và so sánh phiên bản</Button>
      {chapter.isError && <Alert color="red">{getApiErrorMessage(chapter.error)}</Alert>}
      {opened && chapter.data && (
        <RevisionHistory chapterId={selected!} content={chapter.data.draft?.content ?? chapter.data.content ?? ''}
          onClose={() => { setOpened(false); void chapter.refetch(); }}
          onRestore={async content => { await updateChapter(selected!, { content, expectedVersion: chapter.data!.draft?.version ?? chapter.data!.draftVersion ?? 0 }); }} />
      )}
    </Stack>
  );
}
