import { Alert, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { useAuthStore } from '../auth/useAuthStore';
import { CommentComposer } from './CommentComposer';
import { deleteComment, reportContent, updateComment, type CommentInput, type ReaderComment } from './reader-api';

type Action = 'edit' | 'delete' | 'report';
type Change = { account: string } & (
  { action: 'edit'; draft: CommentInput } | { action: 'delete' } | { action: 'report'; reason: string }
);

export function useCommentManagement(comment: ReaderComment, onChanged: () => Promise<unknown>) {
  const user = useAuthStore(state => state.user);
  const active = user?.status === 'ACTIVE';
  const own = user?.userId === comment.userId;
  const privateMode = Boolean(comment.audience && comment.audience !== 'PUBLIC');
  const [action, setAction] = useState<Action>();
  const [draft, setDraft] = useState<CommentInput>({ content: '' });
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [reported, setReported] = useState(false);
  const change = useMutation({
    mutationFn: async (input: Change) => {
      if (useAuthStore.getState().user?.userId !== input.account) throw new Error('Phiên đăng nhập đã thay đổi.');
      switch (input.action) {
        case 'edit': return updateComment({ commentId: comment.commentId, ...input.draft });
        case 'delete': return deleteComment(comment.commentId);
        case 'report': await reportContent({ targetType: 'COMMENT', targetId: comment.commentId, reason: input.reason });
      }
    },
    onSuccess: async (result, input) => {
      if (input.action === 'report') {
        setReported(true);
        setReason('');
        setNotice('Đã gửi báo cáo cho quản trị viên.');
      } else {
        await onChanged();
        if (input.action === 'edit') setNotice(result?.status === 'APPROVED' ? 'Đã lưu bình luận.' : 'Bình luận đang chờ kiểm duyệt.');
      }
      setAction(undefined);
    }
  });
  const busy = change.isPending;
  const canEdit = active && own;
  const canDelete = active && comment.canDelete;
  const canReport = active && !own && comment.status === 'APPROVED';
  const open = (next: Action) => {
    if (busy) return;
    change.reset();
    setNotice('');
    if (next === 'edit') setDraft({
      content: comment.content, isSpoiler: comment.isSpoiler ?? false,
      ...(!privateMode && { mentions: comment.mentions, imageUrl: comment.imageUrl ?? null, gifId: comment.gifId ?? null })
    });
    setAction(next);
  };
  const cancel = () => { change.reset(); setAction(undefined); };
  const form = action === 'edit' ? <CommentComposer privateMode={privateMode} value={draft} onChange={setDraft}
    label="Sửa bình luận" submitLabel="Lưu bình luận" pending={busy} onCancel={cancel}
    onSubmit={value => { if (user && canEdit) change.mutate({ action, account: user.userId, draft: value }); }} />
    : action === 'delete' ? <Stack gap="xs" mt="sm">
      <Text size="sm">{comment.repliesCount > 0 ? 'Xóa bình luận này và các trả lời bên dưới?' : 'Xóa bình luận này?'}</Text>
      <Group><Button color="red" size="xs" loading={busy}
        onClick={() => { if (user && canDelete) change.mutate({ action, account: user.userId }); }}>Xác nhận xóa</Button>
        <Button variant="subtle" size="xs" disabled={busy} onClick={cancel}>Hủy</Button></Group>
    </Stack> : action === 'report' ? <form onSubmit={event => {
      event.preventDefault();
      if (user && canReport && !reported && !busy && reason.trim()) change.mutate({ action, account: user.userId, reason: reason.trim() });
    }}>
      <Textarea mt="sm" label="Lý do báo cáo" maxLength={100} value={reason} onChange={event => setReason(event.currentTarget.value)} disabled={busy} />
      <Group mt="sm"><Button type="submit" size="xs" disabled={!reason.trim()} loading={busy}>Gửi báo cáo</Button>
        <Button size="xs" variant="subtle" disabled={busy} onClick={cancel}>Hủy</Button></Group>
    </form> : null;
  const feedback = <>
    {notice && <Text role="status" mt="sm" size="sm">{notice}</Text>}
    {change.error && <Alert mt="sm" color="red">{getApiErrorMessage(change.error)}</Alert>}
  </>;
  return { action, open, busy, canEdit, canDelete, canReport, reported, form, feedback };
}
