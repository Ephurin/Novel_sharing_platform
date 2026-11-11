import { Router, json } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { requireActiveAccount } from '../../core/security/active-account.js';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { env } from '../../core/config/env.js';
import { limitMediaUploads } from './media-limits.js';
export const mediaDirectory = path.resolve(process.env.MEDIA_DIRECTORY || './uploads');
export const mediaRoutes = Router();
export function imageExtension(buffer: Buffer): 'png' | 'jpg' | 'webp' | 'gif' {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && buffer.toString('ascii',12,16) === 'IHDR') return 'png';
  if (buffer.length >= 12 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer[buffer.length-2] === 255 && buffer[buffer.length-1] === 217) return 'jpg';
  if (buffer.length >= 20 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return 'webp';
  if (buffer.length >= 14 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)) &&
    buffer.readUInt16LE(6) > 0 && buffer.readUInt16LE(6) <= 4096 && buffer.readUInt16LE(8) > 0 && buffer.readUInt16LE(8) <= 4096 && buffer[buffer.length - 1] === 0x3b) return 'gif';
  throw new AppError(400, 'MEDIA_INVALID', 'Chỉ hỗ trợ ảnh PNG, JPEG, WebP hoặc GIF hợp lệ');
}
mediaRoutes.post('/', requireAuth, requireActiveAccount, limitMediaUploads, json({ limit: '2mb' }), async (req, res, next) => {
  try {
    const { data } = z.object({ data: z.string().min(1).max(1400000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).parse(req.body);
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length > 1024*1024) throw new AppError(413, 'MEDIA_TOO_LARGE', 'Ảnh tối đa 1 MB');
    const extension = imageExtension(buffer);
    if (extension === 'gif') throw new AppError(400, 'GIF_UPLOAD_DISABLED', 'Tạm ngưng tải GIF cá nhân. Hãy chọn GIF từ kho GIPHY.');
    const fileName = randomUUID() + '.' + extension;
    await mkdir(mediaDirectory, { recursive: true });
    await writeFile(path.join(mediaDirectory, fileName), buffer, { flag: 'wx' });
    res.status(201).json(successResponse({ path: '/api/v1/media/' + fileName }));
  } catch (error) { next(error); }
});
// GIPHY's browser integration uses a client key and makes provider requests directly.
mediaRoutes.get('/giphy-config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(successResponse({ apiKey: env.GIPHY_PUBLIC_API_KEY ?? null }));
});
mediaRoutes.get('/:fileName', (req, res, next) => {
  const fileName = String(req.params.fileName);
  if (fileName.endsWith('.gif')) {
    res.setHeader('Cache-Control', 'no-store');
    next(new AppError(404, 'MEDIA_NOT_FOUND', 'GIF cá nhân đang tạm ngưng hiển thị.'));
    return;
  }
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(fileName)) { next(new AppError(404, 'MEDIA_NOT_FOUND', 'Ảnh không tồn tại')); return; }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(fileName, { root: mediaDirectory, dotfiles: 'deny' }, error => { if (error) next(error); });
});
