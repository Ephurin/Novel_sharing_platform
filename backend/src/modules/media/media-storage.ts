import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';

export const mediaDirectory = path.resolve(process.env.MEDIA_DIRECTORY || './uploads');

export function uploadCloudinaryImage(buffer: Buffer, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      public_id: publicId,
      resource_type: 'image',
      allowed_formats: ['png', 'jpg', 'jpeg', 'webp'],
      overwrite: false,
      timeout: 20_000
    }, (error, result) => {
      if (error || !result?.secure_url?.startsWith('https://')) {
        const status = error?.http_code;
        reject(new Error(status ? 'Cloudinary upload failed (HTTP ' + status + ')' : 'Cloudinary returned no HTTPS image URL'));
        return;
      }
      resolve(result.secure_url);
    });
    stream.once('error', () => reject(new Error('Cloudinary upload stream failed')));
    stream.end(buffer);
  });
}

export async function storeUploadedImage(buffer: Buffer, extension: 'png' | 'jpg' | 'webp'): Promise<string> {
  const imageId = randomUUID();
  if (env.CLOUDINARY_URL) {
    try {
      return await uploadCloudinaryImage(buffer, 'storycraft/uploads/' + imageId);
    } catch {
      throw new AppError(502, 'MEDIA_STORAGE_UNAVAILABLE', 'Không thể lưu ảnh. Vui lòng thử lại.');
    }
  }

  const fileName = imageId + '.' + extension;
  await mkdir(mediaDirectory, { recursive: true });
  await writeFile(path.join(mediaDirectory, fileName), buffer, { flag: 'wx' });
  return env.API_PREFIX + '/media/' + fileName;
}
