import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { CoverCropEditor } from './CoverCropEditor';
import { FileButton, Button, Stack, Text } from '@mantine/core';
import { apiClient, type ApiEnvelope, getApiErrorMessage } from '../api/api-client';
export async function uploadImage(file: File) {
  if (file.size > 1024 * 1024) throw new Error('Ảnh tối đa 1 MB');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Chọn ảnh PNG, JPEG hoặc WebP');
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Không đọc được ảnh')); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
  const result = await apiClient.post<ApiEnvelope<{ path: string }>>('/media', { data });
  return new URL(result.data.data.path, window.location.origin).href;
}
export function ImageUpload({ onUpload, label = 'Tải ảnh lên', cropCover = false }: { onUpload: (url: string) => void; label?: string; cropCover?: boolean }) {
  const [selected, setSelected] = useState<File | null>(null);
  const mutation = useMutation({ mutationFn: uploadImage, onSuccess: onUpload });
  return <Stack gap={4}><FileButton accept="image/png,image/jpeg,image/webp" onChange={file => { if (file) { mutation.reset(); if (cropCover) setSelected(file); else mutation.mutate(file); } }}>{props => <Button {...props} disabled={mutation.isPending} variant="light" size="xs" loading={mutation.isPending}>{label}</Button>}</FileButton>{selected && <CoverCropEditor file={selected} onCancel={() => setSelected(null)} onConfirm={async file => { await mutation.mutateAsync(file); setSelected(null); }} />}{mutation.isError && !selected && <Text size="sm" c="red" role="alert">{getApiErrorMessage(mutation.error)}</Text>}</Stack>;
}
