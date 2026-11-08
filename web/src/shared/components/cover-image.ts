export const coverSize = { width: 600, height: 900 };

export function validateCoverImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Chọn ảnh PNG, JPEG hoặc WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Ảnh gốc tối đa 10 MB.');
}

export function coverCrop(width: number, height: number, zoom = 1, x = 0.5, y = 0.5) {
  const baseWidth = Math.min(width, height * 2 / 3);
  const cropWidth = baseWidth / Math.max(1, Math.min(3, zoom));
  const cropHeight = cropWidth * 3 / 2;
  return { x: (width - cropWidth) * Math.max(0, Math.min(1, x)), y: (height - cropHeight) * Math.max(0, Math.min(1, y)), width: cropWidth, height: cropHeight };
}

export async function renderCoverImage(image: CanvasImageSource, name: string, crop: { x: number; y: number; width: number; height: number }, output = coverSize) {
  const canvas = document.createElement('canvas'); canvas.width = output.width; canvas.height = output.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  let blob: Blob | null = null;
  for (const quality of [0.92, 0.8, 0.65, 0.5]) {
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= 1024 * 1024) break;
  }
  if (!blob || blob.size > 1024 * 1024) throw new Error('Không xuất được ảnh dưới 1 MB. Hãy chọn ảnh khác.');
  return new File([blob], `${name.replace(/\.[^.]+$/, '')}-cover.jpg`, { type: 'image/jpeg' });
}

/** Small images keep their original framing; large covers are centered without a mandatory editor. */
export async function prepareCoverImage(file: File) {
  validateCoverImage(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new Error('Không đọc được ảnh. Hãy chọn tệp khác.'); }
    const width = image.naturalWidth, height = image.naturalHeight;
    if (width > coverSize.width || height > coverSize.height) return await renderCoverImage(image, file.name, coverCrop(width, height));
    if (file.size <= 1024 * 1024) return file;
    return await renderCoverImage(image, file.name, { x: 0, y: 0, width, height }, { width, height });
  } finally { URL.revokeObjectURL(url); }
}
