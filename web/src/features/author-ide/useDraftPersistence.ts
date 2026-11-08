import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { updateChapter } from '../novels/novel-api';
import type { Chapter } from '../novels/novel-types';
import { ApiClientError } from '../../shared/api/api-client';

export type DraftBuffer = { title: string; content: string; isVip: boolean; priceCoins: number };
type Backup = { value: DraftBuffer; version: number; savedAt: string };
type Slot = { version: number; saved: DraftBuffer; pending?: DraftBuffer; inFlight?: DraftBuffer; running?: Promise<void>; conflict?: boolean; retired?: boolean };
const same = (a: DraftBuffer, b: DraftBuffer) => JSON.stringify(a) === JSON.stringify(b);
export function useDraftPersistence(userId: string, chapterId: string) {
  const slots = useRef(new Map<string, Slot>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const account = useRef({ userId });
  if (account.current.userId !== userId) {
    // Retire the old session synchronously: a debounce/response from it must not
    // dispatch a queued write with the next account's authentication token.
    if (timer.current) clearTimeout(timer.current);
    for (const slot of slots.current.values()) { slot.retired = true; slot.pending = undefined; }
    slots.current = new Map();
    account.current = { userId };
  }
  const session = account.current;
  const current = useRef(chapterId); current.current = chapterId;
  const mounted = useRef(true);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<Backup | null>(null);
  const [dirty, setDirty] = useState(false);
  const key = (id: string) => `storycraft-draft:${userId}:${id}`;
  const update = () => { if (mounted.current) setDirty([...slots.current.values()].some(slot => Boolean(slot.pending || slot.running))); };
  const notify = (id: string, value: typeof status, message='') => { if (account.current !== session) return; update(); if (mounted.current && current.current === id) { setStatus(value); setError(message); } };
  async function drain(id: string): Promise<void> {
    if (account.current !== session || !mounted.current) return;
    const slot = slots.current.get(id);
    if (!slot) return;
    if (slot.running) { await slot.running; if (slot.pending) return drain(id); return; }
    if (slot.conflict) throw Error('Bản nháp có xung đột. Hãy tải bản máy chủ hoặc xuất bản đang viết.');
    const run = async () => {
      while (slot.pending && !slot.retired && mounted.current && account.current === session) {
        const value = slot.pending; slot.pending = undefined;
        slot.inFlight = value;
        notify(id, 'saving');
        try {
          const result = await updateChapter(id, { ...value, autosave: true, expectedVersion: slot.version });
          slot.version = result.draftVersion ?? result.draft?.version ?? slot.version;
          slot.saved = value;
          if (!slot.pending && !slot.retired && mounted.current) {
            try { const backup = JSON.parse(localStorage.getItem(key(id)) ?? 'null') as Backup | null; if (backup && same(backup.value, value)) localStorage.removeItem(key(id)); } catch { /* In-memory draft remains available. */ }
          }
          notify(id, slot.pending ? 'saving' : 'saved');
        } catch (cause) {
          if (!slot.retired) slot.pending ??= value;
          slot.conflict = cause instanceof ApiClientError && cause.status === 409;
          notify(id, 'error', slot.conflict ? 'Có thay đổi từ phiên khác. Bản trên máy được giữ lại; chưa ghi đè bản máy chủ.' : 'Không lưu được bản nháp. Hãy thử lại hoặc tải bản đang viết về máy.');
          throw cause;
        } finally {
          slot.inFlight = undefined;
        }
      }
    };
    slot.running = run(); update();
    try { await slot.running; } finally { slot.running = undefined; update(); }
  }
  function initialize(chapter: Chapter, force=false) {
    if (account.current !== session) throw Error('Phiên tài khoản đã thay đổi.');
    const id = chapter.chapterId;
    const existing = slots.current.get(id);
    if (existing && (!force || existing.running)) { setRecovery(null); setStatus(existing.conflict ? 'error' : existing.pending || existing.running ? 'saving' : 'saved'); return existing.pending ?? existing.inFlight ?? existing.saved; }
    const value: DraftBuffer = { title: chapter.draft?.title ?? chapter.title, content: chapter.draft?.content ?? chapter.content ?? '', isVip: chapter.isVip, priceCoins: chapter.priceCoins };
    slots.current.set(id, { version: chapter.draft?.version ?? chapter.draftVersion ?? 0, saved: value });
    let backup: Backup | null = null;
    try { const stored = JSON.parse(localStorage.getItem(key(id)) ?? 'null') as Backup | null;
      if (stored?.value && typeof stored.value.title === 'string' && typeof stored.value.content === 'string' && typeof stored.value.isVip === 'boolean' && typeof stored.value.priceCoins === 'number' && !same(stored.value, value)) backup = stored;
    } catch { /* Corrupt/unavailable storage must not prevent writing. */ }
    setRecovery(backup); setStatus('saved'); setError(''); update(); return value;
  }
  function queue(value: DraftBuffer) {
    if (account.current !== session) return;
    const id = chapterId, slot = slots.current.get(id);
    if (!slot) return;
    if (timer.current) clearTimeout(timer.current);
    if (same(value, slot.saved) && !slot.running) { slot.pending = undefined; try { localStorage.removeItem(key(id)); } catch {} setStatus('saved'); update(); return; }
    slot.pending = { ...value };
    try { localStorage.setItem(key(id), JSON.stringify({ value, version: slot.version, savedAt: new Date().toISOString() })); }
    catch { setError('Không thể lưu dự phòng trên máy. Hãy giữ trang mở cho đến khi lưu thành công.'); }
    setStatus(slot.conflict ? 'error' : 'saving'); update();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void drain(id).catch(() => {}); }, 1200);
  }
  async function flush() {
    if (account.current !== session) throw Error('Phiên tài khoản đã thay đổi.');
    if (timer.current) clearTimeout(timer.current);
    await Promise.all([...slots.current.keys()].map(id => drain(id)));
    if (account.current !== session) throw Error('Phiên tài khoản đã thay đổi.');
    return slots.current.get(chapterId)?.version ?? 0;
  }
  function abandon() {
    if (account.current !== session) return;
    if (timer.current) clearTimeout(timer.current);
    for (const slot of slots.current.values()) { slot.retired = true; slot.pending = undefined; }
    slots.current.clear();
    update();
  }
  function dismissRecovery() { if (account.current !== session) return; try { localStorage.removeItem(key(chapterId)); } catch {} setRecovery(null); }
  useEffect(() => { setRecovery(null); setError(''); setStatus('saved'); update(); }, [userId]);
  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => { if ([...slots.current.values()].some(slot => slot.pending || slot.running)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search);
  useEffect(() => {
    const resume = () => {
      if (account.current !== session || !mounted.current) return;
      for (const [id, slot] of slots.current) if (slot.pending && !slot.conflict && !slot.retired) void drain(id).catch(() => {});
    };
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, [userId]);
  return { initialize, queue, flush, status, error, recovery, dismissRecovery, abandon, blocker, dirty };
}
