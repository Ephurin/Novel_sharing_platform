import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listMyNovels } from '../../features/novels/novel-api';
import { AnimatedModal } from './AnimatedModal';
import { useAuthStore } from '../../features/auth/useAuthStore';
import './workspace-tools.css';

export type WorkspaceCommand = { label: string; to?: string; action?: () => void; icon?: string };
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
export function isTyping(target: EventTarget | null) { return target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'); }

export function WorkspaceCommands({ commands, author = false }: { commands: WorkspaceCommand[]; author?: boolean }) {
  const role = useAuthStore(s => s.user?.role);
  const userId = useAuthStore(s => s.user?.userId);
  const enabled = role === 'ADMIN' || role === 'AUTHOR';
  const [opened, setOpened] = useState(false), [help, setHelp] = useState(false);
  const [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const navigate = useNavigate(); const id = useId();
  const projects = useQuery({ queryKey: ['author-projects', userId], queryFn: () => listMyNovels(), enabled: enabled && author && opened && !!userId, staleTime: 30000, refetchOnWindowFocus: false });
  const matches = author && query.trim().length >= 2 ? (projects.data ?? []).filter(project => fold(query).trim().split(/\s+/).every(term => fold(project.title).includes(term))) : [];
  const projectCommands: WorkspaceCommand[] = matches.slice(0, 5).flatMap(project => [
    { label: `Quản lý · ${project.title}`, to: `/author/novels/${project.novelId}`, icon: 'menu_book' },
    { label: `Viết tiếp · ${project.title}`, to: `/author/ide?novelId=${encodeURIComponent(project.novelId)}`, icon: 'edit_note' },
    { label: `Cẩm nang · ${project.title}`, to: `/author/context/${project.novelId}`, icon: 'auto_stories' }
  ]);
  const items = [...commands.filter(item => fold(item.label).includes(fold(query))), ...projectCommands];
  useEffect(() => { if (opened) document.getElementById(`${id}-${Math.min(active, items.length - 1)}`)?.scrollIntoView({ block: 'nearest' }); }, [opened, active, query, items.length, id]);
  const open = () => { setQuery(''); setActive(0); setOpened(true); };
  const run = (item: WorkspaceCommand) => { setOpened(false); if (item.to) navigate(item.to); else item.action?.(); };
  useEffect(() => {
    if (!enabled) return;
    const keydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || isTyping(e.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') { e.preventDefault(); setHelp(true); }
      else if (author && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '/') { const search = document.querySelector<HTMLInputElement>('[data-workspace-search]'); if (search) { e.preventDefault(); search.focus(); } }
      else if (author && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n') { const create = document.querySelector<HTMLButtonElement>('[data-workspace-create]'); if (create) { e.preventDefault(); create.click(); } }
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  }, [enabled, author]);
  if (!enabled) return null;
  return <div className="sc-workspace-tools">
    <button type="button" onClick={open} aria-label="Lệnh nhanh" title="Lệnh nhanh (Ctrl + K)"><span className="material-symbols-outlined" aria-hidden="true">search</span></button>
    <button type="button" onClick={() => setHelp(true)} aria-label="Phím tắt" title="Phím tắt (?)"><span className="material-symbols-outlined" aria-hidden="true">keyboard</span></button>
    <AnimatedModal opened={opened} onClose={() => setOpened(false)} title="Lệnh nhanh" centered>
      <input className="sc-command-input" aria-label="Tìm lệnh" role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={items.length ? `${id}-${Math.min(active, items.length - 1)}` : undefined} value={query}
        onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive(index => (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length)); } if (e.key === 'Enter' && items.length) { e.preventDefault(); run(items[Math.min(active, items.length - 1)]); } }} />
      <div className="sc-command-list" id={`${id}-list`} role="listbox" aria-label="Lệnh có sẵn">{items.map((item, index) => <button type="button" id={`${id}-${index}`} key={`${item.to ?? ''}:${item.label}`} role="option" aria-selected={index === active} onClick={() => run(item)}><span className="material-symbols-outlined" aria-hidden="true">{item.icon ?? 'arrow_forward'}</span>{item.label}</button>)}</div>
      {author && projects.isFetching && <p role="status" className="text-meta">Đang tải tác phẩm…</p>}
      {author && projects.isError && <p className="text-meta" role="alert">Không tải được tác phẩm. <button type="button" className="sc-workspace-button" onClick={() => void projects.refetch()}>Thử lại</button></p>}
      {matches.length > 5 && <p className="text-meta">Hiển thị 5/{matches.length} tác phẩm phù hợp. Gõ thêm tên để thu hẹp kết quả.</p>}
      {!items.length && <p role="status">Không có lệnh phù hợp.</p>}
      <p className="sc-command-help">{author ? 'Gõ tên tác phẩm để mở quản lý, Studio hoặc cẩm nang. ' : ''}↑ ↓ để chọn · Enter để mở · Esc để đóng</p>
    </AnimatedModal>
    <AnimatedModal opened={help} onClose={() => setHelp(false)} title="Phím tắt" centered>
      <dl><dt>Ctrl / Cmd + K</dt><dd>Mở lệnh nhanh</dd><dt>?</dt><dd>Xem phím tắt</dd>{author && <><dt>/</dt><dd>Tìm tác phẩm tại bảng làm việc</dd><dt>N</dt><dd>Tạo tác phẩm tại bảng làm việc</dd></>}<dt>Esc</dt><dd>Đóng hộp thoại</dd></dl>
      <p className="sc-command-help">Phím tắt điều hướng không chạy khi bạn đang nhập văn bản hoặc mở hộp thoại khác.</p>
    </AnimatedModal>
  </div>;
}
