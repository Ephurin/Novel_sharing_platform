import { useEffect, useRef, useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { AnimatedProgress } from './AnimatedProgress';
import { coverCrop, renderCoverImage, validateCoverImage } from './cover-image';
import './workspace-tools.css';

/** Inline editor also works inside existing author dialogs without nesting focus traps. */
export function CoverCropEditor({ file, onConfirm, onCancel }: { file: File; onConfirm: (file: File) => Promise<unknown>; onCancel: () => void }) {
  const [source, setSource] = useState(''), [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1), [x, setX] = useState(0.5), [y, setY] = useState(0.5);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const image = useRef<HTMLImageElement>(null), generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setSource(''); setSize({ width: 0, height: 0 }); setZoom(1); setX(0.5); setY(0.5); setError(''); setBusy(false);
    try { validateCoverImage(file); } catch (reason) { setError((reason as Error).message); return; }
    const url = URL.createObjectURL(file); setSource(url);
    return () => { generation.current++; URL.revokeObjectURL(url); };
  }, [file]);
  const crop = coverCrop(size.width, size.height, zoom, x, y);
  const save = async () => {
    if (!image.current || !size.width || busy) return;
    const version = generation.current; setBusy(true); setError('');
    try {
      const fileToUpload = await renderCoverImage(image.current, file.name, crop);
      if (version !== generation.current) return;
      await onConfirm(fileToUpload);
    } catch (reason) { if (version === generation.current) setError(reason instanceof Error ? reason.message : 'Không lưu được ảnh.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  return <section className="sc-cover-crop" aria-label="Cắt ảnh bìa"><Stack gap="sm">
    <Text fw={600} size="sm">Cắt ảnh bìa · 2:3</Text>
    {source && <div className="sc-cover-crop-viewport"><img ref={image} src={source} alt="Xem trước vùng cắt ảnh bìa" draggable={false}
      style={size.width ? { width: `${size.width / crop.width * 100}%`, height: `${size.height / crop.height * 100}%`, left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` } : { visibility: 'hidden' }}
      onLoad={event => { const img = event.currentTarget; setSize({ width: img.naturalWidth, height: img.naturalHeight }); }} onError={() => setError('Không đọc được ảnh. Hãy chọn tệp khác.')} /></div>}
    <label className="sc-crop-control">Phóng to<input type="range" aria-label="Phóng to ảnh bìa" min="1" max="3" step="0.01" value={zoom} disabled={busy || !size.width} onChange={e => setZoom(Number(e.target.value))} /></label>
    <label className="sc-crop-control">Vị trí ngang<input type="range" aria-label="Vị trí ngang ảnh bìa" min="0" max="1" step="0.01" value={x} disabled={busy || !size.width} onChange={e => setX(Number(e.target.value))} /></label>
    <label className="sc-crop-control">Vị trí dọc<input type="range" aria-label="Vị trí dọc ảnh bìa" min="0" max="1" step="0.01" value={y} disabled={busy || !size.width} onChange={e => setY(Number(e.target.value))} /></label>
    {error && <Text size="sm" c="red" role="alert">{error}</Text>}
    {busy && <AnimatedProgress value={null} label="Đang xử lý và tải ảnh bìa…" />}
    <Group justify="flex-end"><Button type="button" variant="subtle" disabled={busy} onClick={() => { setZoom(1); setX(0.5); setY(0.5); }}>Đặt lại vùng cắt</Button><Button type="button" variant="default" disabled={busy} onClick={onCancel}>Hủy cắt ảnh</Button><Button type="button" loading={busy} disabled={!size.width || !!error && !source} onClick={() => void save()}>Dùng ảnh đã cắt</Button></Group>
  </Stack></section>;
}
