import { ChapterSchedule } from './ChapterSchedule';
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Button, Group, Menu, Modal, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiErrorMessage } from '../../shared/api/api-client';
import { getChapter, submitChapterPublish, updateChapter } from '../novels/novel-api';
import type { Chapter } from '../novels/novel-types';
import { RevisionHistory } from '../author-ide/RevisionHistory';
import { sortChapters } from './chapter-sorting';

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
  const [items, setItems] = useState(() => sortChapters(chapters, 'number-asc'));
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: () => apiClient.put(`/novels/${novelId}/chapter-order`, { chapterIds: items.map(item => item.chapterId) }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['chapters', novelId] });
      onClose();
    }
  });
  function moveTo(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= items.length) return;
    setAnnouncement(`Đã chuyển ${items[from].title} đến vị trí ${to + 1}`);
    setItems(old => {
      const next = [...old];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function targetAt(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-order-chapter]');
    return row && listRef.current?.contains(row) ? row.dataset.orderChapter ?? null : null;
  }

  function cancelDrag() {
    dragRef.current = null;
    setDraggedId(null);
    setDropTarget(null);
  }

  // Keep scrolling while a mouse or touch drag is held near either edge.
  useEffect(() => {
    if (!draggedId) return;
    let frame: number;
    function tick() {
      const drag = dragRef.current;
      const list = listRef.current;
      if (!drag || !list) return;
      const bounds = list.getBoundingClientRect();
      if (drag.x >= bounds.left && drag.x <= bounds.right) {
        if (drag.y < bounds.top + 40) list.scrollTop -= 8;
        else if (drag.y > bounds.bottom - 40) list.scrollTop += 8;
      }
      setDropTarget(targetAt(drag.x, drag.y));
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draggedId]);

  return (
    <Modal opened onClose={() => !save.isPending && onClose()} title="Sắp xếp chương" size="lg" className="sc-chapter-order-modal"
      closeOnEscape={!draggedId && !save.isPending} closeOnClickOutside={!draggedId && !save.isPending} withCloseButton={!save.isPending}>
      <Stack>
        <Text size="sm" c="dimmed">Kéo tay nắm hoặc dùng nút mũi tên để đổi vị trí.</Text>
        <div ref={listRef} className="sc-chapter-order-list" role="list" aria-label="Thứ tự chương">
          {items.map((item, index) => (
            <div key={item.chapterId} role="listitem" data-order-chapter={item.chapterId}
              className={`sc-chapter-order-row${draggedId === item.chapterId ? ' is-dragging' : ''}${dropTarget === item.chapterId && draggedId !== item.chapterId ? ' is-drop-target' : ''}`}>
              <ActionIcon variant="subtle" className="sc-chapter-drag-handle" disabled={save.isPending}
                aria-label={`Kéo để di chuyển: ${item.title}`} title="Kéo để di chuyển"
                onPointerDown={event => {
                  if (event.button !== 0 || !event.isPrimary) return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = { id: item.chapterId, x: event.clientX, y: event.clientY };
                  setDraggedId(item.chapterId);
                  setDropTarget(item.chapterId);
                }}
                onPointerMove={event => {
                  if (dragRef.current?.id === item.chapterId) {
                    dragRef.current.x = event.clientX;
                    dragRef.current.y = event.clientY;
                  }
                }}
                onPointerUp={event => {
                  if (dragRef.current?.id !== item.chapterId) return;
                  const target = targetAt(event.clientX, event.clientY);
                  if (target) moveTo(items.findIndex(ch => ch.chapterId === item.chapterId), items.findIndex(ch => ch.chapterId === target));
                  cancelDrag();
                }}
                onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
                onKeyDown={event => {
                  if (event.key === 'Escape' && draggedId) { event.preventDefault(); event.stopPropagation(); cancelDrag(); }
                  if (!draggedId && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                    event.preventDefault();
                    moveTo(index, index + (event.key === 'ArrowUp' ? -1 : 1));
                  }
                }}>
                <span className="material-symbols-outlined" aria-hidden="true">drag_indicator</span>
              </ActionIcon>
              <Text className="sc-chapter-order-title" title={item.title}>{index + 1}. {item.title}</Text>
              <ActionIcon variant="default" disabled={index === 0 || save.isPending || Boolean(draggedId)} aria-label={`Đưa lên: ${item.title}`} onClick={() => moveTo(index, index - 1)}>↑</ActionIcon>
              <ActionIcon variant="default" disabled={index === items.length - 1 || save.isPending || Boolean(draggedId)} aria-label={`Đưa xuống: ${item.title}`} onClick={() => moveTo(index, index + 1)}>↓</ActionIcon>
            </div>
          ))}
        </div>
        <span className="sr-only" role="status">{announcement}</span>
        {save.isError && <Alert color="red">{getApiErrorMessage(save.error)}</Alert>}
        <Button loading={save.isPending} disabled={Boolean(draggedId)} onClick={() => save.mutate()}>Lưu thứ tự</Button>
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
