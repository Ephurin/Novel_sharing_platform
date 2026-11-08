import { useState } from 'react';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { studioSymbolGroups, type StudioSymbol } from './studio-symbols';

export function StudioSpecialCharacters({ opened, onClose, onInsert, selected, onRestoreFocus }: {
  opened: boolean; onClose: () => void; onInsert: (symbol: StudioSymbol) => void; selected: string; onRestoreFocus: () => void;
}) {
  const [query, setQuery] = useState('');
  const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase('vi');
  const groups = studioSymbolGroups.map(group => ({ ...group, symbols: group.symbols.filter(symbol => normalized(`${group.name} ${symbol.name} ${symbol.text}${symbol.close ?? ''}`).includes(normalized(query))) })).filter(group => group.symbols.length);
  return <AnimatedModal opened={opened} onClose={onClose} title="Ký tự đặc biệt" size="lg" onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
    <p className="text-meta">Chọn ký tự để chèn tại con trỏ. Cặp ngoặc sẽ bao quanh phần chữ đang chọn.</p>
    <input className="sc-symbol-search" type="search" aria-label="Tìm ký tự đặc biệt" placeholder="Tìm tên hoặc ký tự, ví dụ: ngoặc Nhật…" value={query} onChange={event => setQuery(event.target.value)} />
    {selected && <p className="sc-symbol-selection">Đang chọn: <span>{selected.length > 120 ? selected.slice(0, 120) + '…' : selected}</span></p>}
    {groups.map(group => <section className="sc-symbol-group" key={group.name} aria-label={group.name}><h3>{group.name}</h3><div className="sc-symbol-grid">
      {group.symbols.map(symbol => <button type="button" key={symbol.name} aria-label={`Chèn ${symbol.name}`} title={symbol.name} onClick={() => onInsert(symbol)}><div className="sc-symbol-glyph" aria-hidden="true">{symbol.text}{symbol.close}</div><small>{symbol.name}</small></button>)}
    </div></section>)}
    {!groups.length && <p role="status">Không có ký tự phù hợp.</p>}
  </AnimatedModal>;
}
