import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction, type PropsWithChildren } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/useAuthStore';
import './workspace-tools.css';

type FilterValue = string | number | boolean;
function read<T>(key: string, fallback: T): T {
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); return value ?? fallback; } catch { return fallback; }
}
/** Browser-only preferences are isolated by account and never contain manuscript content. */
export function useWorkspacePreference<T>(name: string, fallback: T, validate: (value: unknown) => value is T) {
  const userId = useAuthStore(s => s.user?.userId ?? 'guest');
  const key = `storycraft-workspace:${userId}:${name}`;
  const get = () => { const value = read<unknown>(key, fallback); return validate(value) ? value : fallback; };
  const [snapshot, setSnapshot] = useState(() => ({ key, value: get() }));
  const value = snapshot.key === key ? snapshot.value : get();
  const latest = useRef(value); latest.current = value;
  useEffect(() => { const update = (e: StorageEvent) => { if (e.key === key || e.key === null) setSnapshot({ key, value: get() }); }; window.addEventListener('storage', update); return () => window.removeEventListener('storage', update); }, [key]);
  const set: Dispatch<SetStateAction<T>> = next => {
    const result = typeof next === 'function' ? (next as (old: T) => T)(latest.current) : next;
    if (!validate(result)) return;
    latest.current = result; setSnapshot({ key, value: result });
    try { localStorage.setItem(key, JSON.stringify(result)); } catch { /* Keep working for this session. */ }
  };
  return [value, set] as const;
}
export const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 200 && value.every(v => typeof v === 'string' && v.length < 200);

/** One ref makes multiple field setters in the same event compose correctly. */
export function useUrlFilters<T extends Record<string, FilterValue>>(defaults: T, choices: Partial<Record<keyof T, readonly string[]>> = {}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const latest = useRef({ search: location.search, params });
  if (latest.current.search !== location.search) latest.current = { search: location.search, params };
  const parse = (source: URLSearchParams) => {
    const result = { ...defaults };
    for (const name of Object.keys(defaults) as (keyof T & string)[]) {
      const raw = source.get(name); if (raw === null) continue;
      const initial = defaults[name];
      const parsed = typeof initial === 'number' ? (/^\d+$/.test(raw) ? Math.min(100000, Math.max(1, Number(raw))) : initial) : typeof initial === 'boolean' ? raw === 'true' : raw.slice(0, 500);
      if (!choices[name] || choices[name]!.includes(String(parsed))) result[name] = parsed as T[typeof name];
    }
    return result;
  };
  // React Router navigation can be deferred. Controlled inputs must update immediately.
  const [optimistic, setOptimistic] = useState<{ search: string; values: T } | null>(null);
  useLayoutEffect(() => setOptimistic(null), [location.search]);
  const values = optimistic?.search === location.search ? optimistic.values : parse(params);
  const update = (patch: Partial<T>) => {
    const next = new URLSearchParams(latest.current.params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === defaults[key]) next.delete(key); else next.set(key, String(value));
    }
    latest.current.params = next;
    setOptimistic({ search: location.search, values: parse(next) });
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const field = <K extends keyof T>(name: K): [T[K], (value: T[K]) => void] => [values[name], value => update({ [name]: value } as unknown as Partial<T>)];
  return { values, update, field };
}

type Preset = { name: string; query: string };
const presetsValid = (v: unknown): v is Preset[] => Array.isArray(v) && v.length <= 20 && v.every(p => typeof p?.name === 'string' && p.name.length <= 50 && typeof p?.query === 'string' && p.query.length <= 4000);
export function FilterPresets({ name, fields }: { name: string; fields: string[] }) {
  const [params, setParams] = useSearchParams();
  const [presets, setPresets] = useWorkspacePreference<Preset[]>(`filters:${name}`, [], presetsValid);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  return <details className="sc-filter-presets"><summary>Bộ lọc đã lưu{presets.length ? ` (${presets.length})` : ''}</summary>
    <div className="sc-workspace-row">{presets.map(preset => <span className="sc-preset" key={preset.name}>
      <button type="button" onClick={() => { const next = new URLSearchParams(params); fields.forEach(key => next.delete(key)); next.delete('page'); const saved = new URLSearchParams(preset.query); fields.forEach(key => { if (saved.has(key)) next.set(key, saved.get(key)!); }); setParams(next, { replace: true, preventScrollReset: true }); }}>{preset.name}</button>
      <button type="button" aria-label={`Xóa bộ lọc đã lưu ${preset.name}`} onClick={() => setPresets(old => old.filter(p => p.name !== preset.name))}>×</button>
    </span>)}</div>
    <form className="sc-workspace-row" onSubmit={event => { event.preventDefault(); const label = title.trim(); if (!label) return; if (presets.length >= 20 && !presets.some(p => p.name === label)) { setMessage('Tối đa 20 bộ lọc. Hãy xóa một bộ lọc trước.'); return; } const query = new URLSearchParams(); fields.forEach(key => { if (params.has(key)) query.set(key, params.get(key)!); }); setPresets(old => [...old.filter(p => p.name !== label), { name: label, query: query.toString() }]); setTitle(''); setMessage('Đã lưu bộ lọc trên trình duyệt này.'); }}>
      <input aria-label="Tên bộ lọc" placeholder="Tên bộ lọc" maxLength={50} value={title} onChange={e => setTitle(e.target.value)} />
      <button type="submit" disabled={!title.trim()}>Lưu bộ lọc</button>
    </form><span role="status" className="text-meta">{message}</span>
  </details>;
}

export function useListScroll(ready: boolean) {
  const location = useLocation(); const navigation = useNavigationType();
  const userId = useAuthStore(s => s.user?.userId ?? 'guest');
  const key = `storycraft-scroll:${userId}:${location.pathname}${location.search}`;
  const readyRef = useRef(ready); readyRef.current = ready;
  useLayoutEffect(() => {
    let target = 0;
    try { target = navigation === 'POP' ? Number(sessionStorage.getItem(key) || 0) : 0; } catch { /* Optional. */ }
    let restoring = Number.isFinite(target) && target > 0;
    let frame = 0;
    const save = () => { if (restoring || !readyRef.current) return; try { sessionStorage.setItem(key, String(window.scrollY)); } catch { /* Optional. */ } };
    const restore = () => { if (!restoring || !readyRef.current) return; cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { window.scrollTo({ top: target, behavior: 'instant' }); if (Math.abs(window.scrollY - target) < 2) restoring = false; }); };
    const cancel = () => { restoring = false; save(); };
    const observer = new ResizeObserver(restore); observer.observe(document.body); restore();
    window.addEventListener('scroll', save, { passive: true }); window.addEventListener('wheel', cancel, { passive: true }); window.addEventListener('touchstart', cancel, { passive: true });
    return () => { save(); cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', save); window.removeEventListener('wheel', cancel); window.removeEventListener('touchstart', cancel); };
  }, [key, navigation, ready]);
}

/** Opt-in table controls; identity and action columns always remain visible. */
export function WorkspaceTable({ name, columns, children }: PropsWithChildren<{ name: string; columns: string[] }>) {
  const [hidden, setHidden] = useWorkspacePreference<string[]>(`columns:${name}`, [], stringArray);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation(), navigation = useNavigationType();
  const userId = useAuthStore(s => s.user?.userId ?? 'guest');
  const scrollKey = `storycraft-table-scroll:${userId}:${name}:${location.pathname}${location.search}`;
  useLayoutEffect(() => {
    const element = scrollRef.current; if (!element) return;
    let target = { x: 0, y: 0 };
    if (navigation === 'POP') {
      try { const saved = JSON.parse(sessionStorage.getItem(scrollKey) ?? 'null'); if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) target = { x: Math.max(0, saved.x), y: Math.max(0, saved.y) }; } catch { /* Optional preference. */ }
    }
    let restoring = true, frame = 0;
    const save = () => { if (!restoring) try { sessionStorage.setItem(scrollKey, JSON.stringify({ x: element.scrollLeft, y: element.scrollTop })); } catch { /* Keep navigation usable. */ } };
    const restore = () => { if (!restoring) return; element.scrollLeft = target.x; element.scrollTop = target.y; };
    const cancel = () => { restoring = false; save(); };
    const keydown = (event: KeyboardEvent) => { if (['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageDown','PageUp','Home','End',' '].includes(event.key)) cancel(); };
    restore();
    // Recheck after paint and font layout; then leave scrolling entirely to the user.
    frame = requestAnimationFrame(() => { restore(); restoring = false; save(); });
    element.addEventListener('scroll', save, { passive: true }); element.addEventListener('wheel', cancel, { passive: true }); element.addEventListener('touchstart', cancel, { passive: true }); element.addEventListener('keydown', keydown);
    return () => { save(); cancelAnimationFrame(frame); element.removeEventListener('scroll', save); element.removeEventListener('wheel', cancel); element.removeEventListener('touchstart', cancel); element.removeEventListener('keydown', keydown); };
  }, [scrollKey, navigation]);
  const optional = columns.map((label, index) => ({ label, index })).filter(({ index, label }) => index > 0 && label !== 'Thao tác');
  const indexes = optional.filter(c => hidden.includes(c.label)).map(c => c.index + 1);
  const id = `sc-table-${name.replace(/[^a-z0-9-]/gi, '')}`;
  return <div id={id} className="sc-workspace-table">
    <details className="sc-column-settings"><summary>Cột hiển thị</summary><div className="sc-workspace-row">{optional.map(({ label }) => <label key={label}><input type="checkbox" checked={!hidden.includes(label)} onChange={() => setHidden(old => old.includes(label) ? old.filter(c => c !== label) : [...old, label])} /> {label}</label>)}<button type="button" onClick={() => setHidden([])}>Khôi phục</button></div></details>
    <style>{indexes.map(index => `#${id} > .admin-table-scroll > table > :is(thead,tbody) > tr > :nth-child(${index}){display:none}`).join('\n')}</style>
    <div ref={scrollRef} className="admin-table-scroll sc-sticky-table" tabIndex={0} role="region" aria-label="Bảng dữ liệu có thể cuộn">{children}</div>
  </div>;
}
