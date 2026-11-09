import { Button, Checkbox, FileButton, Group, Popover, Textarea } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { uploadImage } from '../../shared/components/ImageUpload';
import { useAuthStore } from '../auth/useAuthStore';
import type { CommentInput } from './reader-api';

export const emptyComment: CommentInput = { content: '', isSpoiler: false, imageUrl: null };
const emoji = ['😀', '😂', '🥰', '😍', '🤔', '😮', '😭', '😎', '👍', '👎', '❤️', '🔥', '👏', '🎉', '🙏', '📚'];

export function CommentIcon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

export function CommentComposer({ value, onChange, onSubmit, label, submitLabel, pending = false, onCancel }: {
  value: CommentInput; onChange: (value: CommentInput) => void; onSubmit: (value: CommentInput) => void;
  label: string; submitLabel: string; pending?: boolean; onCancel?: () => void;
}) {
  const account = useAuthStore(state => state.user?.userId);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const upload = useMutation({
    mutationFn: async ({ file }: { file: File; account?: string }) => new URL(await uploadImage(file, ['image/gif'])).pathname,
    onSuccess: (imageUrl, variables) => {
      if (mounted.current && useAuthStore.getState().user?.userId === variables.account) onChange({ ...value, imageUrl });
    }
  });
  const busy = pending || upload.isPending;
  const insert = (text: string, wrap = false) => {
    const input = textarea.current;
    const start = input?.selectionStart ?? value.content.length;
    const end = input?.selectionEnd ?? start;
    const selected = value.content.slice(start, end);
    const insertion = wrap ? `${text}${selected || 'nội dung'}${text}` : text;
    const content = value.content.slice(0, start) + insertion + value.content.slice(end);
    if (content.length > 2000) return;
    onChange({ ...value, content });
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(start + (wrap ? text.length : insertion.length), start + insertion.length - (wrap ? text.length : 0));
    });
  };
  return <form className="sc-comment-composer" onSubmit={event => {
    event.preventDefault();
    if (!busy && (value.content.trim() || value.imageUrl)) onSubmit({ ...value, content: value.content.trim() });
  }}>
    <Textarea ref={textarea} label={label} placeholder="Chia sẻ cảm nhận về nội dung…" value={value.content}
      onChange={event => onChange({ ...value, content: event.currentTarget.value })}
      maxLength={2000} autosize minRows={3} maxRows={10} disabled={busy}
      onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.form?.requestSubmit(); }} />
    <div className="sc-comment-editor-tools" role="group" aria-label="Công cụ bình luận">
      <Popover opened={emojiOpen} onChange={setEmojiOpen} position="bottom-start" withinPortal={false} trapFocus>
        <Popover.Target><button type="button" className="sc-comment-tool" aria-label="Chèn emoji" title="Chèn emoji" aria-expanded={emojiOpen} disabled={busy} onClick={() => setEmojiOpen(open => !open)}><CommentIcon name="sentiment_satisfied" /></button></Popover.Target>
        <Popover.Dropdown className="sc-comment-emoji-picker" aria-label="Chọn emoji" role="dialog">
          {emoji.map(item => <button key={item} type="button" aria-label={`Chèn ${item}`} onClick={() => insert(item)}>{item}</button>)}
        </Popover.Dropdown>
      </Popover>
      <button type="button" className="sc-comment-tool" aria-label="Chữ đậm" title="Chữ đậm" disabled={busy} onClick={() => insert('**', true)}><CommentIcon name="format_bold" /></button>
      <button type="button" className="sc-comment-tool" aria-label="Chữ nghiêng" title="Chữ nghiêng" disabled={busy} onClick={() => insert('*', true)}><CommentIcon name="format_italic" /></button>
      <FileButton accept="image/gif" onChange={file => { if (file && !busy) upload.mutate({ file, account }); }}>
        {props => <button {...props} type="button" className="sc-comment-tool" aria-label="Đính kèm GIF" title="GIF tối đa 1 MB" disabled={busy}><CommentIcon name="gif_box" /></button>}
      </FileButton>
      <span className="sc-comment-character-count" aria-live="off">{value.content.length.toLocaleString('vi-VN')}/2.000</span>
    </div>
    {upload.isPending && <p className="sc-comment-feedback" role="status">Đang tải GIF…</p>}
    {upload.isError && <p className="sc-comment-error" role="alert">{getApiErrorMessage(upload.error)}</p>}
    {value.imageUrl && <div className="sc-comment-attachment-preview">
      <img src={value.imageUrl} alt="GIF đính kèm" />
      <button type="button" className="sc-comment-tool" aria-label="Bỏ GIF" disabled={busy} onClick={() => onChange({ ...value, imageUrl: null })}><CommentIcon name="close" /></button>
    </div>}
    <div className="sc-comment-composer-footer">
      <Checkbox label="Bình luận này chứa spoiler" checked={value.isSpoiler ?? false} onChange={event => onChange({ ...value, isSpoiler: event.currentTarget.checked })} disabled={busy} />
      <Group gap="xs">
        {onCancel && <Button type="button" variant="subtle" size="sm" disabled={busy} onClick={onCancel}>Hủy</Button>}
        <Button type="submit" size="sm" loading={pending} disabled={busy || (!value.content.trim() && !value.imageUrl)}>{submitLabel}</Button>
      </Group>
    </div>
  </form>;
}
