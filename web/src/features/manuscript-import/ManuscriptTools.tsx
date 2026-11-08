import { useState } from 'react';
import { useWorkspacePreference } from '../../shared/components/WorkspacePreferences';
import { splitPatternError, splitPresetsValid, type SplitPreset } from './manuscript-tools';
import '../../shared/components/workspace-tools.css';

export function SplitPresets({ current, onApply, disabled = false }: { current: Omit<SplitPreset, 'name'>; onApply: (preset: SplitPreset) => void; disabled?: boolean }) {
  const [presets, setPresets] = useWorkspacePreference<SplitPreset[]>('manuscript-split-presets', [], splitPresetsValid);
  const [name, setName] = useState(''), [message, setMessage] = useState('');
  const save = () => {
    const error = splitPatternError(current.pattern); if (error) { setMessage(error); return; }
    const title = name.trim(); if (!title) return;
    if (presets.length >= 20 && !presets.some(p => p.name === title)) { setMessage('Tối đa 20 mẫu. Hãy xóa một mẫu trước.'); return; }
    setPresets(old => [...old.filter(p => p.name !== title), { ...current, name: title }]); setName(''); setMessage('Đã lưu mẫu tách chương trên trình duyệt này.');
  };
  return <details className="sc-filter-presets"><summary>Mẫu tách chương đã lưu ({presets.length})</summary>
    <div className="sc-workspace-row">{presets.map(preset => <span key={preset.name} className="sc-preset"><button type="button" disabled={disabled} onClick={() => { const error = splitPatternError(preset.pattern); if (error) setMessage(error); else { onApply(preset); setMessage(`Đã áp dụng mẫu: ${preset.name}`); } }}>{preset.name}</button><button type="button" disabled={disabled} aria-label={`Xóa mẫu tách chương ${preset.name}`} onClick={() => setPresets(old => old.filter(p => p.name !== preset.name))}>×</button></span>)}</div>
    <div className="sc-workspace-row"><input aria-label="Tên mẫu tách chương" placeholder="Tên mẫu tách chương" maxLength={50} value={name} disabled={disabled} onChange={e => setName(e.target.value)} /><button type="button" disabled={disabled || !name.trim()} onClick={save}>Lưu mẫu tách chương</button></div>
    <span role="status" className="text-meta">{message}</span>
  </details>;
}

/** Show actual transformed text, never rewrite the original file or stored manuscript. */
export function NormalizationPreview({ original, normalized }: { original: string; normalized: string }) {
  const [offset, setOffset] = useState(0);
  const pageSize = 6000;
  const total = Math.max(1, Math.ceil(Math.max(original.length, normalized.length) / pageSize));
  const page = Math.min(offset, total - 1);
  return <details className="sc-normalization-preview"><summary>Xem trước chuẩn hóa {original === normalized ? '· Không đổi' : '· Có thay đổi'}</summary>
    <p className="text-meta">Văn bản gốc được giữ nguyên. Các chương sẽ dùng bản đã chuẩn hóa.</p>
    <div className="sc-diff-grid"><div><strong className="text-meta">Trước chuẩn hóa · {original.length.toLocaleString('vi-VN')} ký tự</strong><pre aria-label="Trước chuẩn hóa">{original.slice(page * pageSize, (page + 1) * pageSize) || '—'}</pre></div><div><strong className="text-meta">Sau chuẩn hóa · {normalized.length.toLocaleString('vi-VN')} ký tự</strong><pre aria-label="Sau chuẩn hóa">{normalized.slice(page * pageSize, (page + 1) * pageSize) || '—'}</pre></div></div>
    {total > 1 && <div className="sc-workspace-row"><button type="button" className="sc-workspace-button" disabled={page === 0} onClick={() => setOffset(page - 1)}>Đoạn trước</button><span className="text-meta">Đoạn {page + 1}/{total} · tối đa 6.000 ký tự mỗi bên</span><button type="button" className="sc-workspace-button" disabled={page === total - 1} onClick={() => setOffset(page + 1)}>Đoạn sau</button></div>}
  </details>;
}
