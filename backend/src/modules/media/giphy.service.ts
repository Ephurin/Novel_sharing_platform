import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { z } from 'zod';
import { limitGiphyLookups } from './media-limits.js';

export async function validateGiphyGif(gifId: string, requesterId: string) {
  const apiKey = env.GIPHY_API_KEY ?? env.GIPHY_PUBLIC_API_KEY;
  if (!apiKey) throw new AppError(503, 'GIPHY_UNAVAILABLE', 'Kho GIF chưa được cấu hình.');
  limitGiphyLookups(requesterId);
  const url = new URL(`https://api.giphy.com/v1/gifs/${encodeURIComponent(gifId)}`);
  url.searchParams.set('api_key', apiKey);
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.status === 404) throw new AppError(400, 'GIPHY_INVALID', 'GIF không tồn tại.');
    if (!response.ok) throw new Error('Provider unavailable');
    body = await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'GIPHY_UNAVAILABLE', 'Chưa xác thực được GIF. Vui lòng thử lại.');
  }
  const gif = z.object({ data: z.object({ id: z.string(), type: z.literal('gif'), rating: z.string() }) }).safeParse(body);
  if (!gif.success || gif.data.data.id !== gifId || !['g', 'pg', 'pg-13'].includes(gif.data.data.rating)) {
    throw new AppError(400, 'GIPHY_INVALID', 'Chọn GIF hợp lệ có phân loại tối đa PG-13.');
  }
}
