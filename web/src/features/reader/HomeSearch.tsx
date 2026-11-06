import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { Popover } from '@animate-ui/react/primitives/radix-ui/popover';
import { Link, useNavigate } from 'react-router-dom';
import { searchPublishedNovels } from './reader-api';

export function HomeSearch({ catalogPath }: { catalogPath: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const listId = useId();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim();
  const [debounced] = useDebouncedValue(query, 250);
  const enabled = open && query.length >= 2 && query === debounced;
  const results = useQuery({ queryKey: ['reader-home-suggestions', debounced],
    queryFn: ({ signal }) => searchPublishedNovels({ q: debounced, sort: 'relevance', order: 'desc' }, signal),
    enabled, staleTime: 30_000, retry: false });
  useEffect(() => {
    if (!enabled) void client.cancelQueries({ queryKey: ['reader-home-suggestions', debounced], exact: true });
  }, [enabled, debounced, client]);
  const items = query === debounced && results.isSuccess ? results.data.slice(0, 5) : [];
  const selected = active >= 0 && active < items.length ? active : -1;
  const expanded = open && query.length >= 2;
  const allPath = `${catalogPath}${query ? `?q=${encodeURIComponent(query)}` : ''}`;
  useEffect(() => {
    if (expanded && selected >= 0) document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [expanded, selected, listId]);

  return <Popover.Root open={expanded} onOpenChange={setOpen}>
    <form className="sc-home-search-form" role="search" onSubmit={event => {
      event.preventDefault(); setOpen(false); navigate(allPath);
    }}>
      <label className="text-form-label" htmlFor={`${listId}-input`}>Tìm truyện</label>
      <Popover.Anchor asChild><div className="sc-home-search">
        <span className="material-symbols-outlined" aria-hidden="true">search</span>
        <input id={`${listId}-input`} role="combobox" aria-label="Tìm truyện trên trang chủ" aria-autocomplete="list"
          aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded && selected >= 0 ? `${listId}-${selected}` : undefined}
          autoComplete="off" placeholder="Bạn muốn đọc truyện gì?" value={value}
          onChange={event => { setValue(event.target.value); setActive(-1); setOpen(true); }}
          onFocus={() => { if (query.length >= 2) setOpen(true); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              if (query.length < 2) return;
              event.preventDefault(); setOpen(true);
              const direction = event.key === 'ArrowDown' ? 1 : -1;
              setActive(index => !items.length ? -1 : index < 0 ? direction > 0 ? 0 : items.length - 1 : (index + direction + items.length) % items.length);
            }
            if (event.key === 'Enter' && expanded && selected >= 0) {
              event.preventDefault(); setOpen(false); navigate(`${catalogPath}/novels/${items[selected].novelId}`);
            }
          }} />
        <button type="submit" aria-label="Tìm truyện"><span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
      </div></Popover.Anchor>
    </form>
    <Popover.Portal><Popover.Content className="sc-home-search-results" role="presentation" align="end" sideOffset={8} collisionPadding={16}
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
      <p className="sc-home-search-status" role="status" aria-atomic="true">{!enabled || results.isPending ? 'Đang tìm…' : results.isError ? 'Chưa tải được gợi ý. Bạn vẫn có thể tìm bằng Enter.' : items.length ? `${items.length} gợi ý truyện` : 'Không có gợi ý phù hợp.'}</p>
      <ul id={listId} role="listbox" aria-label="Gợi ý truyện">
        {items.map((novel, index) => <li key={novel.novelId} role="presentation"><Link role="option" id={`${listId}-${index}`} aria-selected={selected === index}
          tabIndex={-1} to={`${catalogPath}/novels/${novel.novelId}`} onMouseDown={event => event.preventDefault()} onClick={() => setOpen(false)}>
          <strong>{novel.title}</strong>{novel.authorName && <span>{novel.authorName}</span>}
        </Link></li>)}
      </ul>
      <Link className="sc-home-search-all" to={allPath} onClick={() => setOpen(false)}>Xem tất cả kết quả</Link>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
