import { Button, Checkbox, FileButton, Group, Input, Popover } from '@mantine/core';
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { EditorContent } from '@tiptap/react';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { uploadImage } from '../../shared/components/ImageUpload';
import { useAuthStore } from '../auth/useAuthStore';
import type { CommentInput } from './reader-api';
import { useCommentEditor } from './useCommentEditor';
import { GiphyMedia } from './CommentGifPicker';

export const emptyComment: CommentInput = { content: '', isSpoiler: false, imageUrl: null, gifId: null };
const EmojiPicker = lazy(() => import('./CommentEmojiPicker'));
const GifPicker = lazy(() => import('./CommentGifPicker'));

export function CommentIcon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

export function CommentComposer({ value, onChange, onSubmit, label, submitLabel, pending = false, onCancel }: {
  value: CommentInput; onChange: (value: CommentInput) => void; onSubmit: (value: CommentInput) => void;
  label: string; submitLabel: string; pending?: boolean; onCancel?: () => void;
}) {
  const account = useAuthStore(state => state.user?.userId);
  const [picker, setPicker] = useState<'emoji' | 'gif' | null>(null);
  const editorId = useId();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const upload = useMutation({
    mutationFn: async ({ file }: { file: File; account?: string }) => new URL(await uploadImage(file, ['image/gif'])).pathname,
    onSuccess: (imageUrl, variables) => {
      if (mounted.current && useAuthStore.getState().user?.userId === variables.account) onChange({ ...value, imageUrl, gifId: null });
    }
  });
  const busy = pending || upload.isPending;
  const { editor, formatting, limitReached } = useCommentEditor({ value: value.content, id: editorId,
    onChange: content => onChange({ ...value, content }), label, disabled: busy });
  return <form className="sc-comment-composer" onSubmit={event => {
    event.preventDefault();
    if (!busy && (value.content.trim() || value.imageUrl || value.gifId)) onSubmit({ ...value, content: value.content.trim() });
  }}>
    <Input.Wrapper label={label} id={editorId}><EditorContent editor={editor} /></Input.Wrapper>
    {limitReached && <p className="sc-comment-error" role="alert">Tối đa 2.000 ký tự, bao gồm định dạng.</p>}
    <div className="sc-comment-editor-tools" role="group" aria-label="Công cụ bình luận">
      <Popover opened={picker === 'emoji'} onChange={open => setPicker(open ? 'emoji' : null)} position="bottom-start" width="min(360px, calc(100vw - 32px))" withinPortal={false} withRoles={false} trapFocus>
        <Popover.Target><button type="button" className="sc-comment-tool" aria-label="Chèn emoji" title="Chèn emoji" aria-haspopup="dialog" aria-controls={`${editorId}-emoji-picker`} aria-expanded={picker === 'emoji'} disabled={busy} onClick={() => setPicker(current => current === 'emoji' ? null : 'emoji')}><CommentIcon name="sentiment_satisfied" /></button></Popover.Target>
        <Popover.Dropdown id={`${editorId}-emoji-picker`} className="sc-comment-emoji-picker" aria-label="Chọn emoji" role="dialog">
          {picker === 'emoji' && <Suspense fallback={<p role="status">Đang tải emoji…</p>}><EmojiPicker onSelect={emoji => {
            setPicker(null);
            requestAnimationFrame(() => editor?.chain().focus().insertContent({ type: 'text', text: emoji }).run());
          }} /></Suspense>}
        </Popover.Dropdown>
      </Popover>
      <button type="button" className="sc-comment-tool" aria-label="Chữ đậm" title="Chữ đậm" aria-pressed={formatting?.bold ?? false} disabled={busy} onClick={() => editor?.chain().focus().toggleBold().run()}><CommentIcon name="format_bold" /></button>
      <button type="button" className="sc-comment-tool" aria-label="Chữ nghiêng" title="Chữ nghiêng" aria-pressed={formatting?.italic ?? false} disabled={busy} onClick={() => editor?.chain().focus().toggleItalic().run()}><CommentIcon name="format_italic" /></button>
      <Popover opened={picker === 'gif'} onChange={open => setPicker(open ? 'gif' : null)} position="bottom-start" width="min(380px, calc(100vw - 32px))" withinPortal={false} withRoles={false} trapFocus>
        <Popover.Target><button type="button" className="sc-comment-tool" aria-label="Tìm GIF" title="Tìm GIF" aria-haspopup="dialog" aria-controls={`${editorId}-gif-picker`} aria-expanded={picker === 'gif'} disabled={busy} onClick={() => setPicker(current => current === 'gif' ? null : 'gif')}><CommentIcon name="gif_box" /></button></Popover.Target>
        <Popover.Dropdown id={`${editorId}-gif-picker`} className="sc-comment-gif-dropdown" aria-label="Kho GIF" role="dialog">
          {picker === 'gif' && <Suspense fallback={<p role="status">Đang mở kho GIF…</p>}><GifPicker onSelect={gifId => {
            onChange({ ...value, gifId, imageUrl: null }); setPicker(null);
          }} /></Suspense>}
        </Popover.Dropdown>
      </Popover>
      <FileButton accept="image/gif" onChange={file => { if (file && !busy) upload.mutate({ file, account }); }}>
        {props => <button {...props} type="button" className="sc-comment-tool" aria-label="Tải GIF từ máy" title="Tải GIF tối đa 1 MB" disabled={busy}><CommentIcon name="upload" /></button>}
      </FileButton>
      <span className="sc-comment-character-count" aria-live="off">{value.content.length.toLocaleString('vi-VN')}/2.000</span>
    </div>
    {upload.isPending && <p className="sc-comment-feedback" role="status">Đang tải GIF…</p>}
    {upload.isError && <p className="sc-comment-error" role="alert">{getApiErrorMessage(upload.error)}</p>}
    {(value.imageUrl || value.gifId) && <div className="sc-comment-attachment-preview">
      {value.gifId ? <GiphyMedia id={value.gifId} /> : <img src={value.imageUrl!} alt="GIF đính kèm" />}
      <button type="button" className="sc-comment-tool" aria-label="Bỏ GIF" disabled={busy} onClick={() => onChange({ ...value, imageUrl: null, gifId: null })}><CommentIcon name="close" /></button>
    </div>}
    <div className="sc-comment-composer-footer">
      <Checkbox label="Bình luận này chứa spoiler" checked={value.isSpoiler ?? false} onChange={event => onChange({ ...value, isSpoiler: event.currentTarget.checked })} disabled={busy} />
      <Group gap="xs">
        {onCancel && <Button type="button" variant="subtle" size="sm" disabled={busy} onClick={onCancel}>Hủy</Button>}
        <Button type="submit" size="sm" loading={pending} disabled={busy || (!value.content.trim() && !value.imageUrl && !value.gifId)}>{submitLabel}</Button>
      </Group>
    </div>
  </form>;
}
