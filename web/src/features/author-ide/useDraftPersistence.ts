import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { updateChapter } from '../novels/novel-api';
import type { Chapter } from '../novels/novel-types';
import { ApiClientError } from '../../shared/api/api-client';

export type DraftBuffer = { title: string; content: string; isVip: boolean; priceCoins: number };
type Backup = { value: DraftBuffer; version: number; savedAt: string };
type Slot = { version: number; saved: DraftBuffer; pending?: DraftBuffer; running?: Promise<void>; conflict?: boolean };
const same = (a: DraftBuffer, b: DraftBuffer) => JSON.stringify(a) === JSON.stringify(b);
export function useDraftPersistence(userId: string, chapterId: string) {
  const slots = useRef(new Map<string, Slot>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef(chapterId); current.current = chapterId;
  const mounted = useRef(true);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<Backup | null>(null);
  const [dirty, setDirty] = useState(false);
  const key = (id: string) => `storycraft-draft:${userId}:${id}`;
  const update = () => { if (mounted.current) setDirty([...slots.current.values()].some(slot => Boolean(slot.pending || slot.running))); };
  const notify = (id: string, value: typeof status, message='') => { update(); if (mounted.current && current.current === id) { setStatus(value); setError(message); } };
  async function drain(id: string): Promise<void> {
    const slot = slots.current.get(id);
    if (!slot) return;
    if (slot.running) { await slot.running; if (slot.pending) return drain(id); return; }
    if (slot.conflict) throw Error('Bản nháp có xung đột. Hãy tải bản máy chủ hoặc xuất bản đang viết.');
    const run = async () => {
      while (slot.pending) {
        const value = slot.pending; slot.pending = undefined;
        notify(id, 'saving');
        try {
          const result = await updateChapter(id, { ...value, autosave: true, expectedVersion: slot.version });
          slot.version = result.draftVersion ?? result.draft?.version ?? slot.version;
          slot.saved = value;
          if (!slot.pending) {
            try { const backup = JSON.parse(localStorage.getItem(key(id)) ?? 'null') as Backup | null; if (backup && same(backup.value, value)) localStorage.removeItem(key(id)); } catch { /* In-memory draft remains available. */ }
          }
          notify(id, 'saved');
        } catch (cause) {
          slot.pending ??= value;
          slot.conflict = cause instanceof ApiClientError && cause.status === 409;
          notify(id, 'error', slot.conflict ? 'Có thay đổi từ phiên khác. Bản trên máy được giữ lại; chưa ghi đè bản máy chủ.' : 'Không lưu được bản nháp. Hãy thử lại hoặc tải bản đang viết về máy.');
          throw cause;
        }
      }
    };
    slot.running = run(); update();
    try { await slot.running; } finally { slot.running = undefined; update(); }
  }
  function initialize(chapter: Chapter, force=false) {
    const id = chapter.chapterId;
    const existing = slots.current.get(id);
    if (existing && !force) { setRecovery(null); setStatus(existing.conflict ? 'error' : existing.pending || existing.running ? 'saving' : 'saved'); return existing.pending ?? existing.saved; }
    const value: DraftBuffer = { title: chapter.draft?.title ?? chapter.title, content: chapter.draft?.content ?? chapter.content ?? '', isVip: chapter.isVip, priceCoins: chapter.priceCoins };
    slots.current.set(id, { version: chapter.draft?.version ?? chapter.draftVersion ?? 0, saved: value });
    let backup: Backup | null = null;
    try { const stored = JSON.parse(localStorage.getItem(key(id)) ?? 'null') as Backup | null;
      if (stored?.value && typeof stored.value.title === 'string' && typeof stored.value.content === 'string' && typeof stored.value.isVip === 'boolean' && typeof stored.value.priceCoins === 'number' && !same(stored.value, value)) backup = stored;
    } catch { /* Corrupt/unavailable storage must not prevent writing. */ }
    setRecovery(backup); setStatus('saved'); setError(''); update(); return value;
  }
  function queue(value: DraftBuffer) {
    const id = chapterId, slot = slots.current.get(id);
    if (!slot) return;
    if (same(value, slot.saved) && !slot.running) { slot.pending = undefined; try { localStorage.removeItem(key(id)); } catch {} setStatus('saved'); update(); return; }
    slot.pending = { ...value };
    try { localStorage.setItem(key(id), JSON.stringify({ value, version: slot.version, savedAt: new Date().toISOString() })); }
    catch { setError('Không thể lưu dự phòng trên máy. Hãy giữ trang mở cho đến khi lưu thành công.'); }
    setStatus(slot.conflict ? 'error' : 'saving'); update();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void drain(id).catch(() => {}); }, 1200);
  }
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    await Promise.all([...slots.current.keys()].map(id => drain(id)));
    return slots.current.get(chapterId)?.version ?? 0;
  }
  function abandon() {
    if (timer.current) clearTimeout(timer.current);
    for (const slot of slots.current.values()) slot.pending = undefined;
    slots.current.clear();
    update();
  }
  function dismissRecovery() { try { localStorage.removeItem(key(chapterId)); } catch {} setRecovery(null); }
  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => { if ([...slots.current.values()].some(slot => slot.pending || slot.running)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search);
  return { initialize, queue, flush, status, error, recovery, dismissRecovery, abandon, blocker, dirty };
}
