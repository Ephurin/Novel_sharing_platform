import { Alert, Avatar, Badge, Button, Group, Pagination, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { createTargetComment, listTargetComments, listCommentReplies, replyToComment, type CommentTarget } from './comments-api';
import { deleteComment, reportContent, updateComment, type ReaderComment } from './reader-api';

export function CommentsSection({ kind, id }: CommentTarget) {
  const user = useAuthStore(state => state.user);
  const refresh = useRefreshComments();
  const [page, setPage] = useState(1);
  const [content, setContent] = useState('');
  const [notice, setNotice] = useState('');
  const target = { kind, id };
  const prefix = ['comments', kind, id];
  const query = useQuery({ queryKey: [...prefix, user?.userId ?? 'guest', page], queryFn: () => listTargetComments(target, page), enabled: Boolean(id) });
  useEffect(() => { setPage(1); setContent(''); setNotice(''); }, [kind, id, user?.userId]);
  useEffect(() => { if (query.data) setPage(current => Math.min(current, Math.max(1, query.data.totalPages))); }, [query.data?.totalPages]);
  const create = useMutation({ mutationFn: () => createTargetComment(target, content.trim()), onSuccess: async result => {
    setContent(''); setPage(1);
    setNotice(result.status === 'APPROVED' ? 'Đã gửi bình luận.' : 'Bình luận đang chờ kiểm duyệt. Chỉ bạn thấy nội dung này.');
    await refresh();
  }});
  const canComment = user?.status === 'ACTIVE';
  return <Paper withBorder p="md" mt="lg" className="sc-comments" component="section" aria-label={kind === 'novel' ? 'Bình luận tác phẩm' : 'Bình luận chương'}>
    <Group justify="space-between" mb="md"><Title order={3}>{kind === 'novel' ? 'Bình luận tác phẩm' : 'Bình luận chương'}</Title>{query.data && <Text c="dimmed" size="sm">{query.data.totalItems.toLocaleString('vi-VN')} bình luận</Text>}</Group>
    <Stack gap="md">
      {canComment ? <form onSubmit={event => { event.preventDefault(); if (content.trim()) create.mutate(); }}>
        <Textarea label="Bình luận của bạn" placeholder="Chia sẻ cảm nhận về nội dung…" value={content} onChange={event => setContent(event.currentTarget.value)}
          maxLength={2000} autosize minRows={3} maxRows={10} disabled={create.isPending} description="Tối đa 2.000 ký tự." />
        <Button type="submit" mt="sm" loading={create.isPending} disabled={!content.trim()}>Gửi bình luận</Button>
      </form> : <Text size="sm" c="dimmed">{!user ? <><Link to="/login">Đăng nhập</Link> để bình luận.</> : 'Tài khoản đang hoạt động mới được bình luận.'}</Text>}
      {notice && <Text role="status" size="sm">{notice}</Text>}
      {create.isError && <Alert color="red">{getApiErrorMessage(create.error)}</Alert>}
      {query.isPending && <LoadingState label="Đang tải bình luận…" />}
      {query.isError && <ErrorState title="Không tải được bình luận" error={query.error} onRetry={() => void query.refetch()} />}
      {query.data?.totalItems === 0 && <EmptyState title="Chưa có bình luận" description="Các bình luận đã duyệt sẽ xuất hiện tại đây." />}
      {query.data?.items.map(comment => <CommentThread key={comment.commentId} comment={comment} onChanged={refresh} />)}
      {query.data && query.data.totalPages > 1 && <Group justify="center"><Pagination total={query.data.totalPages} value={page} onChange={setPage} siblings={0} boundaries={1} getItemProps={item => ({ 'aria-label': `Trang bình luận ${item}` })} /></Group>}
    </Stack>
  </Paper>;
}
function CommentItem({ comment, onChanged, onReply, showContext = false }: { comment: ReaderComment; onChanged: () => Promise<unknown>; onReply?: () => void; showContext?: boolean }) {
  const user = useAuthStore(state => state.user);
  const own = user?.userId === comment.userId;
  const [mode, setMode] = useState<'read' | 'edit' | 'delete' | 'report'>('read');
  const [content, setContent] = useState(comment.content);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const update = useMutation({ mutationFn: () => updateComment({ commentId: comment.commentId, content: content.trim() }), onSuccess: async result => { setMode('read'); setNotice(result.status === 'APPROVED' ? 'Đã lưu bình luận.' : 'Bình luận đang chờ kiểm duyệt.'); await onChanged(); } });
  const remove = useMutation({ mutationFn: () => deleteComment(comment.commentId), onSuccess: async () => { await onChanged(); } });
  const report = useMutation({ mutationFn: () => reportContent({ targetType: 'COMMENT', targetId: comment.commentId, reason: reason.trim() }), onSuccess: () => { setMode('read'); setReason(''); setNotice('Đã gửi báo cáo cho quản trị viên.'); } });
  const error = update.error ?? remove.error ?? report.error;
  const busy = update.isPending || remove.isPending || report.isPending;
  return <Paper component="article" withBorder p="md">
    {showContext && <Text size="sm" c="dimmed" mb="sm">{comment.chapterId ? `Chương ${comment.chapterNumber ?? ''}: ${comment.chapterTitle ?? 'Chương đã xóa'}` : 'Bình luận tác phẩm'}</Text>}
    <Group wrap="nowrap" align="flex-start">
      <Avatar src={comment.avatarUrl} alt={comment.displayName} size={36} radius="xl">{comment.displayName.trim().slice(0,1) || '?'}</Avatar>
      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}><Text fw={600} style={{ overflowWrap: 'anywhere' }}>{comment.displayName}{own ? ' (Bạn)' : ''}{comment.isAuthor && <Badge ml="xs" size="xs" variant="light">Tác giả</Badge>}</Text><Text component="time" dateTime={comment.createdAt} size="xs" c="dimmed">{new Date(comment.createdAt).toLocaleString('vi-VN')}</Text></Stack>
      {comment.status !== 'APPROVED' && <Badge variant="light" color={comment.status === 'REJECTED' ? 'red' : 'yellow'}>{comment.status === 'REJECTED' ? 'Không được duyệt' : 'Chờ duyệt'}</Badge>}
    </Group>
    {mode === 'edit' ? <form onSubmit={event => { event.preventDefault(); if (content.trim()) update.mutate(); }}>
      <Textarea mt="sm" label="Sửa bình luận" value={content} onChange={event => setContent(event.currentTarget.value)} autosize minRows={3} maxRows={10} maxLength={2000} disabled={busy} />
      <Group mt="sm"><Button type="submit" size="xs" disabled={!content.trim() || content.trim() === comment.content} loading={update.isPending}>Lưu bình luận</Button><Button variant="subtle" size="xs" disabled={busy} onClick={() => setMode('read')}>Hủy</Button></Group>
    </form> : <Text mt="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{comment.content}</Text>}
    {mode === 'read' && user?.status === 'ACTIVE' && <Group gap="xs" mt="sm">
      {own && <Button size="compact-xs" variant="subtle" onClick={() => { setContent(comment.content); setMode('edit'); }}>Sửa</Button>}
      {comment.canDelete && <Button size="compact-xs" variant="subtle" color="red" onClick={() => setMode('delete')}>Xóa</Button>}
      {comment.canReply && onReply && <Button size="compact-xs" variant="subtle" onClick={onReply}>Trả lời</Button>}
      {!own && comment.status === 'APPROVED' && <Button size="compact-xs" variant="subtle" color="gray" disabled={report.isSuccess} onClick={() => setMode('report')}>Báo cáo</Button>}
    </Group>}
    {mode === 'delete' && <Stack gap="xs" mt="sm"><Text size="sm">{comment.repliesCount > 0 ? 'Xóa bình luận này và các trả lời bên dưới?' : 'Xóa bình luận này?'}</Text><Group><Button color="red" size="xs" loading={remove.isPending} onClick={() => remove.mutate()}>Xác nhận xóa</Button><Button variant="subtle" size="xs" disabled={busy} onClick={() => setMode('read')}>Hủy</Button></Group></Stack>}
    {mode === 'report' && <form onSubmit={event => { event.preventDefault(); if (reason.trim()) report.mutate(); }}><Textarea mt="sm" label="Lý do báo cáo" maxLength={100} value={reason} onChange={event => setReason(event.currentTarget.value)} disabled={busy} /><Group mt="sm"><Button type="submit" size="xs" disabled={!reason.trim()} loading={report.isPending}>Gửi báo cáo</Button><Button size="xs" variant="subtle" disabled={busy} onClick={() => setMode('read')}>Hủy</Button></Group></form>}
    {notice && <Text role="status" mt="sm" size="sm">{notice}</Text>}
    {error && <Alert mt="sm" color="red">{getApiErrorMessage(error)}</Alert>}
  </Paper>;
}

export function useRefreshComments() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ['comments'] }),
    client.invalidateQueries({ queryKey: ['author-comments'] }),
    client.invalidateQueries({ queryKey: ['comment-replies'] })
  ]);
}

export function CommentThread({ comment, onChanged, showContext = false }: { comment: ReaderComment; onChanged: () => Promise<unknown>; showContext?: boolean }) {
  const user = useAuthStore(state => state.user);
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const [page, setPage] = useState(1);
  const [content, setContent] = useState('');
  const [notice, setNotice] = useState('');
  const replies = useQuery({ queryKey: ['comment-replies', comment.commentId, user?.userId ?? 'guest', page], queryFn: () => listCommentReplies(comment.commentId, page), enabled: open });
  useEffect(() => { if (replies.data) setPage(current => Math.min(current, Math.max(1, replies.data.totalPages))); }, [replies.data?.totalPages]);
  const create = useMutation({ mutationFn: () => replyToComment(comment.commentId, content.trim()), onSuccess: async result => {
    setReplying(false); setContent(''); setOpen(true); setPage(Math.max(1, Math.ceil((comment.repliesCount + 1) / 5)));
    setNotice(result.status === 'APPROVED' ? 'Đã gửi trả lời.' : 'Trả lời đang chờ kiểm duyệt.'); await onChanged();
  }});
  return <Stack gap="xs" className="sc-comment-thread" data-comment-id={comment.commentId}>
    <CommentItem comment={comment} onChanged={onChanged} showContext={showContext} onReply={() => { setReplying(true); setOpen(true); }} />
    {(comment.repliesCount > 0 || open) && <Button variant="subtle" size="compact-xs" style={{ alignSelf: 'flex-start' }} aria-expanded={open} aria-controls={`replies-${comment.commentId}`} onClick={() => setOpen(value => !value)}>{open ? 'Ẩn trả lời' : `Xem ${comment.repliesCount} trả lời`}</Button>}
    {open && <Stack id={`replies-${comment.commentId}`} gap="sm" pl="md" style={{ borderLeft: '2px solid var(--sc-border)', minWidth: 0 }}>
      {replies.isPending && <LoadingState label="Đang tải trả lời…" />}
      {replies.isError && <ErrorState title="Không tải được trả lời" error={replies.error} onRetry={() => void replies.refetch()} />}
      {replies.data?.items.map(reply => <CommentItem key={reply.commentId} comment={reply} onChanged={onChanged} />)}
      {replies.data && replies.data.totalPages > 1 && <Pagination size="sm" total={replies.data.totalPages} value={page} onChange={setPage} siblings={0} boundaries={1} />}
      {replying && comment.canReply && <form onSubmit={event => { event.preventDefault(); if (content.trim()) create.mutate(); }}>
        <Textarea label="Trả lời bình luận" placeholder="Viết phản hồi của bạn…" value={content} onChange={event => setContent(event.currentTarget.value)} maxLength={2000} autosize minRows={2} maxRows={8} disabled={create.isPending} />
        <Group mt="sm"><Button type="submit" size="xs" disabled={!content.trim()} loading={create.isPending}>Gửi trả lời</Button><Button size="xs" variant="subtle" disabled={create.isPending} onClick={() => setReplying(false)}>Hủy</Button></Group>
      </form>}
      {notice && <Text role="status" size="sm">{notice}</Text>}
      {create.isError && <Alert color="red">{getApiErrorMessage(create.error)}</Alert>}
    </Stack>}
  </Stack>;
}
