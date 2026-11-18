import { Button, Checkbox, Group, Input, Popover, Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { connections } from './social-api';
import { useAuthStore } from '../auth/useAuthStore';
import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { EditorContent } from '@tiptap/react';
import type { CommentInput } from './reader-api';
import { useCommentEditor } from './useCommentEditor';
import { GiphyMedia } from './CommentGifPicker';

export const emptyComment: CommentInput = { content: '', isSpoiler: false, imageUrl: null, gifId: null };
const EmojiPicker = lazy(() => import('./CommentEmojiPicker'));
const GifPicker = lazy(() => import('./CommentGifPicker'));

export function CommentIcon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

export function CommentComposer({ value, onChange, onSubmit, label, submitLabel, pending = false, onCancel, autoFocus = false, privateMode = false }: {
  value: CommentInput; onChange: (value: CommentInput) => void; onSubmit: (value: CommentInput) => void;
  label: string; submitLabel: string; pending?: boolean; onCancel?: () => void; autoFocus?: boolean; privateMode?: boolean;
}) {
  const [picker, setPicker] = useState<'emoji' | 'gif' | null>(null);
  const account = useAuthStore(state => state.user?.userId);
  const [mentionSearch, setMentionSearch] = useState('');
  const mutual = useQuery({ queryKey: ['connections', account, 'mention', mentionSearch], queryFn: () => connections('MUTUAL', mentionSearch), enabled: Boolean(account && !privateMode) });
  const editorId = useId();
  const busy = pending;
  const { editor, formatting, limitReached } = useCommentEditor({ value: value.content, id: editorId,
    onChange: content => onChange({ ...value, content, mentions: value.mentions?.filter(mention => content.slice(0, mention.end) === value.content.slice(0, mention.end)) }), label, disabled: busy });
  useEffect(() => { if (autoFocus) editor?.commands.focus('end'); }, [editor, autoFocus]);
  return <form className="sc-comment-composer" onSubmit={event => {
    event.preventDefault();
    const leading = value.content.length - value.content.trimStart().length;
    if (!busy && (value.content.trim() || value.imageUrl || value.gifId)) onSubmit({ ...value, content: value.content.trim(), mentions: privateMode ? undefined : value.mentions?.map(mention => ({ ...mention, start: mention.start - leading, end: mention.end - leading })) });
  }}>
    <Input.Wrapper label={label} id={editorId}><EditorContent editor={editor} /></Input.Wrapper>
    {!privateMode && account && <Select aria-label="Nhắc đến bạn bè" placeholder="@ Nhắc đến bạn bè" searchable clearable value={null} searchValue={mentionSearch} onSearchChange={setMentionSearch} disabled={busy}
      data={(mutual.data?.items ?? []).map(person => ({ value: person.userId, label: `@${person.username} · ${person.displayName}` }))}
      nothingFoundMessage={mutual.isError ? 'Không tải được bạn bè' : 'Không có bạn bè phù hợp'} onChange={id => {
        const person = mutual.data?.items.find(person => person.userId === id); if (!person) return;
        const prefix = value.content ? `${value.content.trimEnd()} ` : ''; const token = `@${person.username}`;
        if (prefix.length + token.length + 1 > 2000) return;
        onChange({ ...value, content: `${prefix}${token} `, mentions: [...(value.mentions ?? []), { userId: person.userId, start: prefix.length, end: prefix.length + token.length }] }); setMentionSearch('');
      }} />}
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
      <button type="button" className="sc-comment-tool" aria-label="Chữ đậm" title="Chữ đậm" aria-pressed={formatting?.bold ?? false} disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}><CommentIcon name="format_bold" /></button>
      <button type="button" className="sc-comment-tool" aria-label="Chữ nghiêng" title="Chữ nghiêng" aria-pressed={formatting?.italic ?? false} disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}><CommentIcon name="format_italic" /></button>
      {!privateMode && <Popover opened={picker === 'gif'} onChange={open => setPicker(open ? 'gif' : null)} position="bottom-start" width="min(380px, calc(100vw - 32px))" withinPortal={false} withRoles={false} trapFocus>
        <Popover.Target><button type="button" className="sc-comment-tool" aria-label="Tìm GIF" title="Tìm GIF" aria-haspopup="dialog" aria-controls={`${editorId}-gif-picker`} aria-expanded={picker === 'gif'} disabled={busy} onClick={() => setPicker(current => current === 'gif' ? null : 'gif')}><CommentIcon name="gif_box" /></button></Popover.Target>
        <Popover.Dropdown id={`${editorId}-gif-picker`} className="sc-comment-gif-dropdown" aria-label="Kho GIF" role="dialog">
          {picker === 'gif' && <Suspense fallback={<p role="status">Đang mở kho GIF…</p>}><GifPicker onSelect={gifId => {
            onChange({ ...value, gifId, imageUrl: null }); setPicker(null);
          }} /></Suspense>}
        </Popover.Dropdown>
      </Popover>}
      <span className="sc-comment-character-count" aria-live="off">{value.content.length.toLocaleString('vi-VN')}/2.000</span>
    </div>
    {(value.imageUrl || value.gifId) && <div className="sc-comment-attachment-preview">
      {value.gifId ? <GiphyMedia id={value.gifId} /> : <p className="sc-comment-feedback">GIF cá nhân đang tạm ngưng. Hãy bỏ tệp để gửi bình luận.</p>}
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
