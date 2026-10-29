import { useEffect, useRef, useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import './workspace-tools.css';

export function coverCrop(width: number, height: number, zoom: number, x: number, y: number) {
  const baseWidth = Math.min(width, height * 2 / 3);
  const cropWidth = baseWidth / Math.max(1, Math.min(3, zoom));
  const cropHeight = cropWidth * 3 / 2;
  return { x: (width - cropWidth) * Math.max(0, Math.min(1, x)), y: (height - cropHeight) * Math.max(0, Math.min(1, y)), width: cropWidth, height: cropHeight };
}

/** Inline editor also works inside existing author dialogs without nesting focus traps. */
export function CoverCropEditor({ file, onConfirm, onCancel }: { file: File; onConfirm: (file: File) => Promise<unknown>; onCancel: () => void }) {
  const [source, setSource] = useState(''), [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1), [x, setX] = useState(0.5), [y, setY] = useState(0.5);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const image = useRef<HTMLImageElement>(null), generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setSource(''); setSize({ width: 0, height: 0 }); setZoom(1); setX(0.5); setY(0.5); setError(''); setBusy(false);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Chọn ảnh PNG, JPEG hoặc WebP.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Ảnh gốc tối đa 10 MB.'); return; }
    const url = URL.createObjectURL(file); setSource(url);
    return () => { generation.current++; URL.revokeObjectURL(url); };
  }, [file]);
  const crop = coverCrop(size.width, size.height, zoom, x, y);
  const save = async () => {
    if (!image.current || !size.width || busy) return;
    const version = generation.current; setBusy(true); setError('');
    try {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Trình duyệt không hỗ trợ cắt ảnh.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, 600, 900);
      context.drawImage(image.current, crop.x, crop.y, crop.width, crop.height, 0, 0, 600, 900);
      let blob: Blob | null = null;
      for (const quality of [0.92, 0.8, 0.65, 0.5]) {
        blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= 1024 * 1024) break;
      }
      if (!blob || blob.size > 1024 * 1024) throw new Error('Không xuất được ảnh dưới 1 MB. Hãy chọn ảnh khác.');
      if (version !== generation.current) return;
      await onConfirm(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-cover.jpg`, { type: 'image/jpeg' }));
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
    <Group justify="flex-end"><Button type="button" variant="subtle" disabled={busy} onClick={() => { setZoom(1); setX(0.5); setY(0.5); }}>Đặt lại vùng cắt</Button><Button type="button" variant="default" disabled={busy} onClick={onCancel}>Hủy cắt ảnh</Button><Button type="button" loading={busy} disabled={!size.width || !!error && !source} onClick={() => void save()}>Dùng ảnh đã cắt</Button></Group>
  </Stack></section>;
}
