import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import './reader-filter-bar.css';

// UI-18: Danh sách truyện and Tìm kiếm share one filter bar above the results: one disclosure per facet,
// then a row of the filters in force, each removable on its own. Choices apply immediately.

type Facet = 'genres' | 'tags' | 'status';

export type ReaderFilterValue = { genres: string[]; tags: string[]; status: string };

type Props = {
  value: ReaderFilterValue;
  genreOptions: string[];
  tagOptions: string[];
  statuses: ReadonlyArray<readonly [string, string]>;
  taxonomy: { pending: boolean; error: boolean; retry: () => void };
  onChange: (patch: Partial<ReaderFilterValue>) => void;
  /** Clears genres, tags and status; keywords are kept (UI-06). */
  onReset: () => void;
  /** Rendered at the end of the trigger row, e.g. the sort select. */
  trailing?: ReactNode;
};

export function ReaderFilterBar({ value, genreOptions, tagOptions, statuses, taxonomy, onChange, onReset, trailing }: Props) {
  const [open, setOpen] = useState<Facet | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggers = useRef<Partial<Record<Facet, HTMLButtonElement | null>>>({});
  const baseId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const trigger = triggers.current[open];
      setOpen(null);
      trigger?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (field: 'genres' | 'tags', name: string) => {
    const current = value[field];
    onChange({ [field]: current.includes(name) ? current.filter(item => item !== name) : [...current, name] });
  };
  const statusLabel = statuses.find(([code]) => code === value.status)?.[1];
  const activeCount = value.genres.length + value.tags.length + (value.status ? 1 : 0);

  const trigger = (facet: Facet, label: string, count: number) => (
    <button
      ref={node => { triggers.current[facet] = node; }}
      type="button"
      className={`sc-filter-trigger${count ? ' is-active' : ''}`}
      aria-expanded={open === facet}
      aria-controls={`${baseId}-${facet}`}
      onClick={() => setOpen(current => (current === facet ? null : facet))}
    >
      <span>{label}</span>
      {count > 0 && <span className="sc-filter-trigger-count">{count}</span>}
      <span className="material-symbols-outlined" aria-hidden="true">expand_more</span>
    </button>
  );

  const checklist = (field: 'genres' | 'tags', options: string[], empty: string, retryLabel: string) =>
    taxonomy.error ? (
      <button type="button" className="sc-filter-retry" onClick={taxonomy.retry}>↻ {retryLabel}</button>
    ) : options.length === 0 ? (
      <p className="sc-filter-empty">{taxonomy.pending ? 'Đang tải…' : empty}</p>
    ) : (
      <div className="sc-filter-options" translate="no">
        {options.map(name => (
          <label key={name} className="sc-filter-option">
            <input type="checkbox" value={name} checked={value[field].includes(name)} onChange={() => toggle(field, name)} />
            <span>{name}</span>
          </label>
        ))}
      </div>
    );

  return (
    <div ref={rootRef} className="sc-filter-bar" role="group" aria-label="Bộ lọc truyện">
      <div className="sc-filter-triggers">
        {trigger('genres', 'Thể loại', value.genres.length)}
        {trigger('tags', 'Thẻ', value.tags.length)}
        {trigger('status', statusLabel && value.status ? `Tình trạng: ${statusLabel}` : 'Tình trạng', 0)}
        {trailing && <div className="sc-filter-trailing">{trailing}</div>}
      </div>

      {open === 'genres' && (
        <div id={`${baseId}-genres`} className="sc-filter-panel" role="group" aria-label="Lọc theo thể loại">
          {checklist('genres', genreOptions, 'Chưa có thể loại', 'Tải lại thể loại')}
        </div>
      )}
      {open === 'tags' && (
        <div id={`${baseId}-tags`} className="sc-filter-panel" role="group" aria-label="Lọc theo thẻ">
          {checklist('tags', tagOptions, 'Chưa có thẻ', 'Tải lại thẻ')}
        </div>
      )}
      {open === 'status' && (
        <div id={`${baseId}-status`} className="sc-filter-panel is-compact">
          <div className="sc-filter-options" role="radiogroup" aria-label="Lọc theo tình trạng">
            {statuses.map(([code, label]) => (
              <label key={code || 'all'} className="sc-filter-option">
                <input type="radio" name={`${baseId}-status`} value={code} checked={value.status === code} onChange={() => onChange({ status: code })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <div className="sc-filter-active" aria-label="Bộ lọc đang áp dụng">
          {value.genres.map(name => (
            <button key={`g:${name}`} type="button" className="sc-filter-chip" aria-label={`Bỏ lọc thể loại ${name}`} onClick={() => toggle('genres', name)}>
              {name} <span aria-hidden="true">✕</span>
            </button>
          ))}
          {value.tags.map(name => (
            <button key={`t:${name}`} type="button" className="sc-filter-chip" aria-label={`Bỏ lọc thẻ ${name}`} onClick={() => toggle('tags', name)}>
              #{name} <span aria-hidden="true">✕</span>
            </button>
          ))}
          {value.status && statusLabel && (
            <button type="button" className="sc-filter-chip" aria-label={`Bỏ lọc tình trạng ${statusLabel}`} onClick={() => onChange({ status: '' })}>
              {statusLabel} <span aria-hidden="true">✕</span>
            </button>
          )}
          <button type="button" className="sc-filter-reset" onClick={() => { setOpen(null); onReset(); }}>↻ Đặt lại bộ lọc</button>
        </div>
      )}
    </div>
  );
}
