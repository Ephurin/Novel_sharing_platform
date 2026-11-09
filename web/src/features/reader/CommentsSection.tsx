import { Alert, Avatar, Badge, Button, Group, Pagination, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { createTargetComment, listTargetComments, listCommentReplies, reactToComment, replyToComment, type CommentTarget } from './comments-api';
import { deleteComment, reportContent, updateComment, type CommentInput, type ReaderComment } from './reader-api';
import { CommentComposer, CommentIcon, emptyComment } from './CommentComposer';
import './comments.css';

function requireSameAccount(account: string) {
  if (useAuthStore.getState().user?.userId !== account) throw new Error('Phiên đăng nhập đã thay đổi.');
}

export function CommentsSection({ kind, id }: CommentTarget) {
  const user = useAuthStore(state => state.user);
  const refresh = useRefreshComments();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<CommentInput>(emptyComment);
  const [notice, setNotice] = useState('');
  const scope = `${kind}:${id}:${user?.userId ?? 'guest'}`;
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const query = useQuery({ queryKey: ['comments', kind, id, user?.userId ?? 'guest', page],
    queryFn: () => listTargetComments({ kind, id }, page), enabled: Boolean(id) });
  useEffect(() => { setPage(1); setDraft(emptyComment); setNotice(''); create.reset(); }, [scope]);
  useEffect(() => { if (query.data) setPage(current => Math.min(current, Math.max(1, query.data.totalPages))); }, [query.data?.totalPages]);
  const create = useMutation({
    mutationFn: ({ target, draft, account }: { target: CommentTarget; draft: CommentInput; account: string; scope: string }) => {
      requireSameAccount(account);
      return createTargetComment(target, draft);
    },
    onSuccess: async (result, variables) => {
      if (latestScope.current === variables.scope) {
        setDraft(emptyComment); setPage(1);
        setNotice(result.status === 'APPROVED' ? 'Đã gửi bình luận.' : 'Bình luận đang chờ kiểm duyệt. Chỉ bạn thấy nội dung này.');
      }
      await refresh();
    }
  });
  const canComment = user?.status === 'ACTIVE';
  return <Paper withBorder p="md" mt="lg" className="sc-comments" component="section" aria-label={kind === 'novel' ? 'Bình luận tác phẩm' : 'Bình luận chương'}>
    <Group justify="space-between" mb="md">
      <Title order={3}>{kind === 'novel' ? 'Bình luận tác phẩm' : 'Bình luận chương'}</Title>
      {query.data && <Text c="dimmed" size="sm">{query.data.totalItems.toLocaleString('vi-VN')} bình luận</Text>}
    </Group>
    <Stack gap="md">
      {canComment ? <CommentComposer key={scope} value={draft} onChange={setDraft} label="Bình luận của bạn" submitLabel="Gửi bình luận" pending={create.isPending}
        onSubmit={draft => create.mutate({ target: { kind, id }, draft, account: user.userId, scope })} />
        : <Text size="sm" c="dimmed">{!user ? <><Link to="/login">Đăng nhập</Link> để bình luận.</> : 'Tài khoản đang hoạt động mới được bình luận.'}</Text>}
      {notice && <Text role="status" size="sm">{notice}</Text>}
      {create.isError && <Alert color="red">{getApiErrorMessage(create.error)}</Alert>}
      {query.isPending && <LoadingState label="Đang tải bình luận…" />}
      {query.isError && <ErrorState title="Không tải được bình luận" error={query.error} onRetry={() => void query.refetch()} />}
      {query.data?.totalItems === 0 && <EmptyState title="Chưa có bình luận" description="Các bình luận đã duyệt sẽ xuất hiện tại đây." />}
      {query.data?.items.map(comment => <CommentThread key={`${user?.userId ?? 'guest'}:${comment.commentId}`} comment={comment} onChanged={refresh} />)}
      {query.data && query.data.totalPages > 1 && <Group justify="center"><Pagination total={query.data.totalPages} value={page} onChange={setPage} siblings={0} boundaries={1} getItemProps={item => ({ 'aria-label': `Trang bình luận ${item}` })} /></Group>}
    </Stack>
  </Paper>;
}

function CommentItem({ comment, onChanged, onReply, showContext = true, forceSpoiler = false }: {
  comment: ReaderComment; onChanged: () => Promise<unknown>; onReply?: () => void; showContext?: boolean; forceSpoiler?: boolean;
}) {
  const user = useAuthStore(state => state.user);
  const own = user?.userId === comment.userId;
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)', false, { getInitialValueInEffect: false });
  const [mode, setMode] = useState<'read' | 'edit' | 'delete' | 'report'>('read');
  const [draft, setDraft] = useState<CommentInput>({ content: comment.content, isSpoiler: comment.isSpoiler ?? false, imageUrl: comment.imageUrl ?? null });
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [playGif, setPlayGif] = useState(false);
  const [failedImage, setFailedImage] = useState(false);
  const [reaction, setReaction] = useState<Pick<ReaderComment, 'likesCount' | 'dislikesCount' | 'myReaction'> | null>(null);
  useEffect(() => { setRevealed(false); setPlayGif(false); setFailedImage(false); }, [comment.content, comment.isSpoiler, comment.imageUrl, forceSpoiler]);
  useEffect(() => setReaction(null), [comment.likesCount, comment.dislikesCount, comment.myReaction]);
  const update = useMutation({
    mutationFn: ({ account, ...draft }: CommentInput & { account: string }) => {
      requireSameAccount(account);
      return updateComment({ commentId: comment.commentId, ...draft });
    },
    onSuccess: async result => { setMode('read'); setNotice(result.status === 'APPROVED' ? 'Đã lưu bình luận.' : 'Bình luận đang chờ kiểm duyệt.'); await onChanged(); }
  });
  const remove = useMutation({ mutationFn: () => deleteComment(comment.commentId), onSuccess: onChanged });
  const report = useMutation({ mutationFn: () => reportContent({ targetType: 'COMMENT', targetId: comment.commentId, reason: reason.trim() }),
    onSuccess: () => { setMode('read'); setReason(''); setNotice('Đã gửi báo cáo cho quản trị viên.'); } });
  const vote = useMutation({
    scope: { id: `comment-reaction:${user?.userId}:${comment.commentId}` },
    mutationFn: ({ account, value }: { account: string; value: 'LIKE' | 'DISLIKE' | null }) => {
      requireSameAccount(account);
      return reactToComment(comment.commentId, value);
    },
    onSuccess: async result => { setReaction(result); await onChanged(); }
  });
  const error = update.error ?? remove.error ?? report.error ?? vote.error;
  const busy = update.isPending || remove.isPending || report.isPending;
  const active = user?.status === 'ACTIVE';
  const counts = reaction ?? comment;
  const spoiler = Boolean(comment.isSpoiler || forceSpoiler);
  const base = user?.role === 'READER' ? '/reader' : '/public';
  const source = comment.chapterId ? `Chương ${comment.chapterNumber ?? 'đã xóa'}` : 'Thảo luận chung';
  return <Paper component="article" withBorder p="md" className="sc-comment-item" data-comment-id={comment.commentId}>
    <Group wrap="nowrap" align="flex-start">
      <Avatar src={comment.avatarUrl} alt={comment.displayName} size={36} radius="xl">{comment.displayName.trim().slice(0, 1) || '?'}</Avatar>
      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{comment.displayName}{own ? ' (Bạn)' : ''}{comment.isAuthor && <Badge ml="xs" size="xs" variant="light">Tác giả</Badge>}</Text>
        {showContext && <Link className="sc-comment-source" title={comment.chapterTitle ?? undefined}
          to={comment.chapterId ? `${base}/chapters/${comment.chapterId}` : `${base}/novels/${comment.novelId}#reader-comments`}>{source}</Link>}
        <Text component="time" dateTime={comment.createdAt} size="xs" c="dimmed">{new Date(comment.createdAt).toLocaleString('vi-VN')}</Text>
      </Stack>
      {comment.status !== 'APPROVED' && <Badge variant="light" color={comment.status === 'REJECTED' ? 'red' : 'yellow'}>{comment.status === 'REJECTED' ? 'Không được duyệt' : 'Chờ duyệt'}</Badge>}
    </Group>
    {mode === 'edit' ? <CommentComposer value={draft} onChange={setDraft} label="Sửa bình luận" submitLabel="Lưu bình luận" pending={update.isPending}
      onSubmit={draft => { if (user) update.mutate({ ...draft, account: user.userId }); }} onCancel={() => setMode('read')} />
      : <div className="sc-comment-body">
        {spoiler && <button type="button" className="sc-comment-spoiler" aria-expanded={revealed} onClick={() => setRevealed(value => !value)}>
          <CommentIcon name="visibility_off" />{revealed ? 'Ẩn spoiler' : 'Có spoiler · Bấm để xem'}
        </button>}
        {(!spoiler || revealed) && <>
          <ManuscriptContent content={comment.content} />
          {comment.imageUrl && !failedImage && <div className="sc-comment-media">
            {(!reduceMotion || playGif) ? <><img src={comment.imageUrl} alt="GIF trong bình luận" loading="lazy" onError={() => setFailedImage(true)} />
              {reduceMotion && <button type="button" className="sc-comment-text-action" onClick={() => setPlayGif(false)}>Ẩn GIF</button>}</>
              : <button type="button" className="sc-comment-text-action" onClick={() => setPlayGif(true)}><CommentIcon name="play_arrow" />Xem GIF</button>}
          </div>}
          {failedImage && <Text size="sm" c="dimmed">Không tải được GIF.</Text>}
        </>}
      </div>}
    {mode === 'read' && <div className="sc-comment-actions">
      {comment.status === 'APPROVED' && <>
        {(['LIKE', 'DISLIKE'] as const).map(value => <button key={value} type="button" className="sc-comment-reaction" aria-label={value === 'LIKE' ? 'Thích bình luận' : 'Không thích bình luận'}
          aria-pressed={counts.myReaction === value} aria-description={`${(value === 'LIKE' ? counts.likesCount : counts.dislikesCount) ?? 0} lượt`}
          disabled={!active || vote.isPending} onClick={() => {
            if (user) vote.mutate({ account: user.userId, value: counts.myReaction === value ? null : value });
          }}>
          <CommentIcon name={value === 'LIKE' ? 'thumb_up' : 'thumb_down'} /><span>{(value === 'LIKE' ? counts.likesCount : counts.dislikesCount) ?? 0}</span>
        </button>)}
      </>}
      {active && <>
        {comment.canReply && onReply && <button type="button" className="sc-comment-text-action" onClick={onReply}><CommentIcon name="reply" />Trả lời</button>}
        {own && <button type="button" className="sc-comment-text-action" onClick={() => {
          setDraft({ content: comment.content, isSpoiler: comment.isSpoiler ?? false, imageUrl: comment.imageUrl ?? null }); setMode('edit');
        }}>Sửa</button>}
        {comment.canDelete && <button type="button" className="sc-comment-text-action is-danger" onClick={() => setMode('delete')}>Xóa</button>}
        {!own && comment.status === 'APPROVED' && <button type="button" className="sc-comment-text-action" disabled={report.isSuccess} onClick={() => setMode('report')}>Báo cáo</button>}
      </>}
    </div>}
    {mode === 'delete' && <Stack gap="xs" mt="sm"><Text size="sm">{comment.repliesCount > 0 ? 'Xóa bình luận này và các trả lời bên dưới?' : 'Xóa bình luận này?'}</Text><Group><Button color="red" size="xs" loading={remove.isPending} onClick={() => remove.mutate()}>Xác nhận xóa</Button><Button variant="subtle" size="xs" disabled={busy} onClick={() => setMode('read')}>Hủy</Button></Group></Stack>}
    {mode === 'report' && <form onSubmit={event => { event.preventDefault(); if (reason.trim()) report.mutate(); }}>
      <Textarea mt="sm" label="Lý do báo cáo" maxLength={100} value={reason} onChange={event => setReason(event.currentTarget.value)} disabled={busy} />
      <Group mt="sm"><Button type="submit" size="xs" disabled={!reason.trim()} loading={report.isPending}>Gửi báo cáo</Button><Button size="xs" variant="subtle" disabled={busy} onClick={() => setMode('read')}>Hủy</Button></Group>
    </form>}
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

export function CommentThread({ comment, onChanged, showContext = true }: { comment: ReaderComment; onChanged: () => Promise<unknown>; showContext?: boolean }) {
  const user = useAuthStore(state => state.user);
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<CommentInput>(emptyComment);
  const [notice, setNotice] = useState('');
  const replies = useQuery({ queryKey: ['comment-replies', comment.commentId, user?.userId ?? 'guest', page], queryFn: () => listCommentReplies(comment.commentId, page), enabled: open });
  useEffect(() => { if (replies.data) setPage(current => Math.min(current, Math.max(1, replies.data.totalPages))); }, [replies.data?.totalPages]);
  useEffect(() => { setReplying(false); setDraft(emptyComment); setNotice(''); setOpen(false); setPage(1); create.reset(); }, [user?.userId]);
  const create = useMutation({
    mutationFn: ({ draft, account }: { draft: CommentInput; account: string }) => {
      requireSameAccount(account);
      return replyToComment(comment.commentId, draft);
    },
    onSuccess: async (result, variables) => {
      if (useAuthStore.getState().user?.userId === variables.account) {
        setReplying(false); setDraft(emptyComment); setOpen(true); setPage(Math.max(1, Math.ceil((comment.repliesCount + 1) / 5)));
        setNotice(result.status === 'APPROVED' ? 'Đã gửi trả lời.' : 'Trả lời đang chờ kiểm duyệt.');
      }
      await onChanged();
    }
  });
  const accountKey = user?.userId ?? 'guest';
  return <Stack gap="xs" className="sc-comment-thread" data-comment-id={comment.commentId}>
    <CommentItem key={`${accountKey}:${comment.commentId}`} comment={comment} onChanged={onChanged} showContext={showContext} onReply={() => { setReplying(true); setOpen(true); }} />
    {(comment.repliesCount > 0 || open) && <Button variant="subtle" size="compact-xs" style={{ alignSelf: 'flex-start' }} aria-expanded={open} aria-controls={`replies-${comment.commentId}`} onClick={() => setOpen(value => !value)}>{open ? 'Ẩn trả lời' : `Xem ${comment.repliesCount} trả lời`}</Button>}
    {open && <Stack id={`replies-${comment.commentId}`} gap="sm" className="sc-comment-replies">
      {replies.isPending && <LoadingState label="Đang tải trả lời…" />}
      {replies.isError && <ErrorState title="Không tải được trả lời" error={replies.error} onRetry={() => void replies.refetch()} />}
      {replies.data?.items.map(reply => <CommentItem key={`${accountKey}:${reply.commentId}`} comment={reply} onChanged={onChanged} showContext={showContext} forceSpoiler={comment.isSpoiler} />)}
      {replies.data && replies.data.totalPages > 1 && <Pagination size="sm" total={replies.data.totalPages} value={page} onChange={setPage} siblings={0} boundaries={1} />}
      {replying && comment.canReply && <CommentComposer key={accountKey} value={draft} onChange={setDraft} label="Trả lời bình luận" submitLabel="Gửi trả lời" pending={create.isPending}
        onSubmit={draft => { if (user) create.mutate({ draft, account: user.userId }); }} onCancel={() => setReplying(false)} />}
      {notice && <Text role="status" size="sm">{notice}</Text>}
      {create.isError && <Alert color="red">{getApiErrorMessage(create.error)}</Alert>}
    </Stack>}
  </Stack>;
}
