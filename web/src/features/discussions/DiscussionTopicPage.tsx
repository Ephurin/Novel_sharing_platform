import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, Button, Group, Loader, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  IconAlertTriangle, IconArrowBackUp, IconDots, IconEye, IconHeart, IconLink, IconMessage,
  IconMessages, IconPencil, IconTrash, IconChevronDown, IconChevronUp, IconLock, IconReportAnalytics, IconSend,
  IconFeather, IconHelpCircle, IconMicrophone2
} from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTopic, listComments, locateComment, createComment, updateComment, deleteComment, deleteTopic,
  setLike, recordView, reportDiscussion, type Comment, type Topic, type TopicAuthor
} from './discussion-api';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { useAuthStore } from '../auth/useAuthStore';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { AnimatedMenu } from '../../shared/components/AnimatedMenu';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { DiscussionComposer, DiscussionBody } from './DiscussionComposer';
import { RoleBadge } from './DiscussionRole';

const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam hoặc quảng cáo' },
  { value: 'HARASSMENT', label: 'Quấy rối' },
  { value: 'HATE_SPEECH', label: 'Ngôn từ thù ghét' },
  { value: 'SPOILER', label: 'Tiết lộ nội dung' },
  { value: 'ADULT_CONTENT', label: 'Nội dung không phù hợp' },
  { value: 'OTHER', label: 'Lý do khác' }
];

const formatDate = (value: string) => new Date(value).toLocaleString('vi-VN');
const relativeTime = (value: string) => {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} ngày trước` : formatDate(value);
};
const authorName = (author: TopicAuthor | null) => author?.displayName ?? 'Thành viên';
const profilePath = (author: TopicAuthor) => `/${author.role === 'AUTHOR' ? 'authors' : 'readers'}/${author.userId}`;

const CATEGORY_ICONS: Record<string, typeof IconFeather> = {
  'thao-luan-chung': IconMessages,
  'goc-tac-gia': IconFeather,
  'hoi-dap': IconHelpCircle,
  'thong-bao-cong-dong': IconMicrophone2
};

function AuthorLink({ author, compact }: { author: TopicAuthor | null; compact?: boolean }) {
  if (!author) return <span className="forum-identity-name">Thành viên</span>;
  return <Link to={profilePath(author)} className="forum-identity-link">
    <Avatar src={author.avatarUrl} name={authorName(author)} alt="" size={compact ? 26 : 34} radius="xl"
      className="forum-identity-avatar" data-role={author.role === 'AUTHOR' ? 'author' : undefined} />
    <span className="forum-identity-name">{authorName(author)}</span>
    <RoleBadge role={author.role} />
  </Link>;
}

function CategoryLabel({ category }: { category: Topic['category'] }) {
  const Icon = CATEGORY_ICONS[category.slug] ?? IconMessages;
  return (
    <Link to={`/discussions?category=${category.slug}`} className="forum-badge forum-category-badge" data-category={category.slug}>
      <Icon size={15} aria-hidden="true" />{category.name}
    </Link>
  );
}

export function DiscussionTopicPage() {
  const { topicId: id = '' } = useParams();
  return <DiscussionTopic key={id} id={id} />;
}

function DiscussionTopic({ id }: { id: string }) {
  const [params] = useSearchParams();
  const targetId = params.get('commentId');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const viewerId = user?.userId ?? 'guest';
  const [focusRequest, setFocusRequest] = useState(0);
  const [notice, setNotice] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [replyTo, setReplyTo] = useState<{ rootId: string; replyToId: string; name: string } | null>(null);
  const [composerBody, setComposerBody] = useState('');
  const [editing, setEditing] = useState<{ commentId: string; body: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ scope: 'TOPIC' | 'COMMENT'; commentId?: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: 'DISCUSSION' | 'DISCUSSION_COMMENT'; id: string } | null>(null);
  const [reportReason, setReportReason] = useState('SPAM');
  const [reportDescription, setReportDescription] = useState('');
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});

  const topicQuery = useQuery({ queryKey: ['discussion-topic', id, viewerId], queryFn: () => getTopic(id), enabled: Boolean(id) });
  const rootsQuery = useInfiniteQuery({
    queryKey: ['discussion-roots', id, viewerId],
    queryFn: ({ pageParam }) => listComments(id, undefined, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(id)
  });
  const topic = topicQuery.data;
  const isOwner = Boolean(topic && user && topic.author?.userId === user.userId);
  const locked = Boolean(topic?.isLocked);

  useEffect(() => {
    if (!topic) return;
    void recordView(id).then(() => queryClient.invalidateQueries({ queryKey: ['discussion-topic', id] })).catch(() => undefined);
  }, [id, Boolean(topic), queryClient]);

  const locationQuery = useQuery({
    queryKey: ['discussion-location', id, targetId, viewerId],
    queryFn: () => locateComment(id, targetId!),
    enabled: Boolean(id && targetId && topic),
    retry: false
  });
  const located = locationQuery.data;
  useEffect(() => {
    if (!located || !targetId) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`comment-${targetId}`);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [located, targetId]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['discussion-topic', id] });
    queryClient.invalidateQueries({ queryKey: ['discussion-roots', id] });
    queryClient.invalidateQueries({ queryKey: ['discussion-replies', id] });
    queryClient.invalidateQueries({ queryKey: ['discussion-location', id] });
    queryClient.invalidateQueries({ queryKey: ['discussions'] });
    queryClient.invalidateQueries({ queryKey: ['discussions-mine'] });
  }, [queryClient, id]);

  const onError = (error: unknown) => setNotice({ type: 'error', text: getApiErrorMessage(error) });
  const onSuccess = (text: string) => { setNotice({ type: 'info', text }); refresh(); };

  const createMutation = useMutation({
    mutationFn: () => createComment(id, composerBody.trim(), replyTo?.replyToId),
    onSuccess: ({ commentId }) => {
      if (replyTo) setExpandedRoots(previous => ({ ...previous, [replyTo.rootId]: true }));
      setComposerBody('');
      setReplyTo(null);
      onSuccess('Đã gửi bình luận.');
      navigate({ search: `?commentId=${commentId}`, hash: `#comment-${commentId}` }, { replace: true });
    },
    onError
  });
  const editMutation = useMutation({
    mutationFn: () => updateComment(id, editing!.commentId, editing!.body.trim()),
    onSuccess: () => { setEditing(null); onSuccess('Đã cập nhật nội dung.'); }, onError
  });
  const deleteTopicMutation = useMutation({ mutationFn: () => deleteTopic(id), onSuccess: () => { onSuccess('Đã xoá chủ đề.'); navigate('/discussions'); }, onError });
  const deleteCommentMutation = useMutation({ mutationFn: (commentId: string) => deleteComment(id, commentId), onSuccess: () => onSuccess('Đã xoá bình luận.'), onError });
  const likeMutation = useMutation({
    mutationFn: (input: { commentId: string | null; liked: boolean }) => setLike(id, input.commentId, input.liked),
    onSuccess: () => refresh(), onError
  });
  const reportMutation = useMutation({
    mutationFn: () => reportDiscussion(reportTarget!.type, reportTarget!.id, reportReason, reportDescription.trim() || undefined),
    onSuccess: () => { setReportTarget(null); setReportDescription(''); setNotice({ type: 'info', text: 'Đã gửi báo cáo tới quản trị viên.' }); }, onError
  });

  const copyPermalink = async (commentId: string) => {
    const link = `${window.location.origin}/discussions/${id}?commentId=${commentId}#comment-${commentId}`;
    try { await navigator.clipboard.writeText(link); setNotice({ type: 'info', text: 'Đã sao chép liên kết.' }); } catch { setNotice({ type: 'error', text: 'Không thể sao chép liên kết.' }); }
  };

  const handleReply = useCallback((target: { rootId: string; replyToId: string; name: string }) => {
    setReplyTo(target);
    setFocusRequest(request => request + 1);
  }, []);

  if (topicQuery.isLoading) return <LoadingState label="Đang tải chủ đề…" />;
  if (topicQuery.isError) return <ErrorState error={topicQuery.error} onRetry={() => topicQuery.refetch()} />;
  if (!topic) return <EmptyState description="Không tìm thấy chủ đề này." />;

  const roots = rootsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  if (located && !roots.some(root => root.commentId === located.root.commentId)) roots.unshift(located.root);
  const canWrite = Boolean(user);

  return (
    <div className="forum-topic sc-editorial-topic" data-category={topic.category.slug}>
      <nav className="forum-breadcrumb sc-topic-crumbs" aria-label="Đường dẫn">
        <Link to="/discussions">Thảo luận</Link>
        <span className="forum-breadcrumb-sep" aria-hidden="true">›</span>
        <Link to={`/discussions?category=${topic.category.slug}`}>{topic.category.name}</Link>
        <span className="forum-breadcrumb-sep" aria-hidden="true">›</span>
        <span className="forum-breadcrumb-crumb" aria-current="page" title={topic.title}>{topic.title}</span>
      </nav>

      {notice ? <div className="forum-callout" role="status" data-tone={notice.type === 'error' ? 'warning' : 'muted'}>
        <Text size="sm">{notice.text}</Text>
        <Button size="compact-xs" variant="subtle" onClick={() => setNotice(null)}>Đóng</Button>
      </div> : null}

      <article className="forum-article sc-paper" data-category={topic.category.slug} aria-labelledby="sc-discussion-title">
        <header className="forum-article-head">
          <div className="forum-badges">
            <CategoryLabel category={topic.category} />
            {topic.isPinned ? <span className="forum-badge" data-tone="muted">Ghim</span> : null}
            {locked ? <span className="forum-badge" data-tone="warning">Đã khoá</span> : null}
          </div>

          <h1 className="forum-heading sc-headline" id="sc-discussion-title">{topic.title}</h1>

          <div className="forum-byline sc-byline">
            <div className="forum-identity">
              <AuthorLink author={topic.author} />
              <span className="sc-byline-dot" aria-hidden="true">·</span>
              <time className="forum-time" dateTime={topic.createdAt} title={formatDate(topic.createdAt)}>{relativeTime(topic.createdAt)}</time>
              {topic.editedAt ? <span className="forum-time" title={formatDate(topic.editedAt)}>(đã sửa)</span> : null}
            </div>
            {user && <AnimatedMenu>
              <AnimatedMenu.Target><button type="button" className="forum-icon-btn" aria-label="Tùy chọn chủ đề"><IconDots size={18} aria-hidden="true" /></button></AnimatedMenu.Target>
              <AnimatedMenu.Dropdown>
                {isOwner && !locked ? <AnimatedMenu.Item component={Link} to={`/discussions/${id}/edit`} leftSection={<IconPencil size={16} />}>Sửa chủ đề</AnimatedMenu.Item> : null}
                {isOwner ? <AnimatedMenu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => setConfirmDelete({ scope: 'TOPIC' })}>Xoá chủ đề</AnimatedMenu.Item> : null}
                {user && !isOwner ? <AnimatedMenu.Item leftSection={<IconReportAnalytics size={16} />} onClick={() => setReportTarget({ type: 'DISCUSSION', id })}>Báo cáo chủ đề</AnimatedMenu.Item> : null}
              </AnimatedMenu.Dropdown>
            </AnimatedMenu>}
          </div>
        </header>

        <div className="forum-measure sc-prose-measure"><DiscussionBody text={topic.body} /></div>

        <footer className="forum-article-footer sc-article-footer">
          <button type="button" className="forum-stat" data-active={topic.viewerLiked || undefined} aria-pressed={topic.viewerLiked}
            aria-label={topic.viewerLiked ? `Bỏ thích chủ đề (${topic.likeCount})` : `Thích chủ đề (${topic.likeCount})`}
            disabled={!user || (locked && !topic.viewerLiked) || likeMutation.isPending}
            onClick={() => likeMutation.mutate({ commentId: null, liked: !topic.viewerLiked })}>
            <IconHeart size={15} aria-hidden="true" /> {topic.likeCount}<span className="forum-stat-label">{topic.viewerLiked ? 'Đã thích' : 'Thích'}</span>
          </button>
          <span className="forum-stat" title={`${topic.viewCount} lượt xem`} aria-label={`${topic.viewCount} lượt xem`}>
            <IconEye size={15} aria-hidden="true" /> {topic.viewCount}
            <span className="forum-stat-label" aria-hidden="true">lượt xem</span>
          </span>
          <span className="forum-stat" title={`${topic.replyCount} trả lời`} aria-label={`${topic.replyCount} trả lời`}>
            <IconMessage size={15} aria-hidden="true" /> {topic.replyCount}
            <span className="forum-stat-label" aria-hidden="true">trả lời</span>
          </span>
          <span className="forum-stat forum-stat-quiet">
            <time dateTime={topic.lastActivityAt} title={formatDate(topic.lastActivityAt)}>Hoạt động {relativeTime(topic.lastActivityAt)}</time>
          </span>
        </footer>
      </article>

      <section className="forum-comments sc-discussion" aria-labelledby="forum-comments-heading" data-category={topic.category.slug}>
        <div className="forum-comments-head sc-discussion-head">
          <div className="sc-discussion-title-wrap">
            <h2 id="forum-comments-heading">Bình luận <span className="forum-count">{topic.replyCount}</span></h2>
          </div>
        </div>

        {/* One compose field: the section heading already names it, the toolbar carries
            the counter and the send action, so there is no separate button strip. */}
        <div className="forum-comment-composer" id="sc-discussion-composer" data-category={topic.category.slug}>
          {locked ? <div className="forum-callout" data-tone="warning">
            <Text size="sm">Chủ đề đã bị khoá. Bạn vẫn có thể báo cáo hoặc gỡ nội dung của mình.</Text>
          </div> : !canWrite ? <div className="forum-callout" data-tone="muted">
            <Text size="sm">Đăng nhập để tham gia thảo luận.</Text><Button size="compact-xs" component={Link} to="/login">Đăng nhập</Button>
          </div> : <Stack gap={6}>
            {replyTo ? <Group gap={6} justify="space-between" className="forum-reply-context">
              <Text size="xs" c="dimmed">Đang trả lời <strong>{replyTo.name}</strong></Text>
              <Button size="compact-xs" variant="subtle" onClick={() => setReplyTo(null)}>Huỷ</Button>
            </Group> : null}
            <DiscussionComposer hideLabel value={composerBody} onChange={setComposerBody}
              label={replyTo ? `Trả lời ${replyTo.name}` : 'Bình luận của bạn'}
              maxLength={10000} minRows={3} focusRequest={focusRequest} disabled={createMutation.isPending}
              placeholder={replyTo ? `Trả lời ${replyTo.name}…` : 'Chia sẻ suy nghĩ của bạn…'}
              action={<Button size="xs" leftSection={<IconSend size={14} />} loading={createMutation.isPending}
                disabled={!composerBody.trim()} onClick={() => createMutation.mutate()}>Gửi</Button>} />
          </Stack>}
        </div>

        {locationQuery.isError ? <div className="forum-callout" data-tone="muted"><Text size="sm">Bình luận trong liên kết không còn công khai.</Text></div> : null}
        {rootsQuery.isLoading ? <Loader size="sm" aria-label="Đang tải bình luận" /> : null}
        {rootsQuery.isError ? <ErrorState error={rootsQuery.error} onRetry={() => rootsQuery.refetch()} /> : null}
        {!rootsQuery.isLoading && !rootsQuery.isError && roots.length === 0 ? <div className="forum-empty">
          <IconMessages size={26} aria-hidden="true" />
          <p>Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận về chủ đề này.</p>
        </div> : null}

        {roots.length > 0 ? <div className="forum-threads sc-timeline" data-category={topic.category.slug}>
          {roots.map((root) => (
            <CommentThread key={root.commentId} topicId={id} root={root} currentUserId={user?.userId} locked={locked}
              expand={expandedRoots[root.commentId] ?? located?.root.commentId === root.commentId}
              locatedReply={located?.comment.rootId === root.commentId ? located.comment : undefined}
              onExpand={() => setExpandedRoots((prev) => ({ ...prev, [root.commentId]: true }))}
              onCollapse={() => setExpandedRoots((prev) => ({ ...prev, [root.commentId]: false }))}
              onReply={handleReply}
              onEdit={(c) => setEditing({ commentId: c.commentId, body: c.body })}
              onDelete={(c) => setConfirmDelete({ scope: 'COMMENT', commentId: c.commentId })}
              onLike={(c) => likeMutation.mutate({ commentId: c.commentId, liked: !c.viewerLiked })}
              onReport={(c) => setReportTarget({ type: 'DISCUSSION_COMMENT', id: c.commentId })}
              onPermalink={copyPermalink} />
          ))}
        </div> : null}

        {rootsQuery.hasNextPage ? <Button variant="light" size="xs" className="sc-load-more" loading={rootsQuery.isFetchingNextPage}
          onClick={() => rootsQuery.fetchNextPage()}>Tải thêm bình luận</Button> : null}
      </section>

      <AnimatedModal opened={confirmDelete?.scope === 'TOPIC'} onClose={() => setConfirmDelete(null)} title="Xoá chủ đề" size="sm">
        <Stack gap="md">
          <Text size="sm">Chủ đề và toàn bộ bình luận sẽ bị gỡ khỏi trang thảo luận. Bạn có chắc chắn?</Text>
          <Group justify="flex-end"><Button size="xs" variant="default" onClick={() => setConfirmDelete(null)}>Huỷ</Button>
            <Button size="xs" color="red" loading={deleteTopicMutation.isPending} onClick={() => deleteTopicMutation.mutate()}>Xoá</Button></Group>
        </Stack>
      </AnimatedModal>

      <AnimatedModal opened={confirmDelete?.scope === 'COMMENT'} onClose={() => setConfirmDelete(null)} title="Xoá bình luận" size="sm">
        <Stack gap="md">
          <Text size="sm">Bình luận này sẽ bị xoá. Bạn có chắc chắn?</Text>
          <Group justify="flex-end"><Button size="xs" variant="default" onClick={() => setConfirmDelete(null)}>Huỷ</Button>
            <Button size="xs" color="red" loading={deleteCommentMutation.isPending}
              onClick={() => { const commentId = confirmDelete?.commentId; if (!commentId) return; setConfirmDelete(null); deleteCommentMutation.mutate(commentId); }}>Xoá</Button></Group>
        </Stack>
      </AnimatedModal>

      <AnimatedModal opened={Boolean(editing && editing.commentId)} onClose={() => setEditing(null)} title="Sửa bình luận">
        {editing && editing.commentId ? <Stack gap="xs">
          <DiscussionComposer value={editing.body} onChange={(body) => setEditing({ ...editing, body })} label="Nội dung" maxLength={10000} minRows={4} />
          <Group justify="flex-end"><Button size="xs" variant="default" onClick={() => setEditing(null)}>Huỷ</Button>
            <Button size="xs" loading={editMutation.isPending} disabled={!editing.body.trim()} onClick={() => editMutation.mutate()}>Lưu</Button></Group>
        </Stack> : null}
      </AnimatedModal>

      <AnimatedModal opened={Boolean(reportTarget)} onClose={() => setReportTarget(null)} title="Báo cáo nội dung">
        <Stack gap="sm">
          <Select label="Lý do" data={REPORT_REASONS} value={reportReason} onChange={value => { if (value) setReportReason(value); }} />
          <TextInput label="Mô tả thêm" value={reportDescription} onChange={(e) => setReportDescription(e.currentTarget.value)} maxLength={2000} />
          <Group justify="flex-end"><Button size="xs" variant="default" onClick={() => setReportTarget(null)}>Huỷ</Button>
            <Button size="xs" color="red" loading={reportMutation.isPending} onClick={() => reportMutation.mutate()}>Gửi báo cáo</Button></Group>
        </Stack>
      </AnimatedModal>
    </div>
  );
}

type ThreadProps = {
  topicId: string; root: Comment; currentUserId?: string; locked: boolean; expand: boolean; onExpand: () => void; onCollapse: () => void;
  onReply: (target: { rootId: string; replyToId: string; name: string }) => void; onEdit: (c: Comment) => void; onDelete: (c: Comment) => void;
  onLike: (c: Comment) => void; onReport: (c: Comment) => void; onPermalink: (id: string) => void;
  locatedReply?: Comment;
};

function CommentThread(props: ThreadProps) {
  const { root, topicId, expand, onExpand, onCollapse } = props;
  const repliesQuery = useInfiniteQuery({
    queryKey: ['discussion-replies', topicId, root.commentId, props.currentUserId ?? 'guest'],
    queryFn: ({ pageParam }) => listComments(topicId, root.commentId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: expand
  });
  const replies = repliesQuery.data?.pages.flatMap((p) => p.items) ?? [];
  if (props.locatedReply && !replies.some(reply => reply.commentId === props.locatedReply?.commentId)) replies.unshift(props.locatedReply);
  return (
    <article className="forum-thread sc-thread" data-category={root.author?.role === 'AUTHOR' ? 'author' : undefined}>
      <div className="forum-thread-content">
        <CommentRow comment={root} {...props} />

        {root.replyCount > 0 ? <div className="sc-thread-guide">
          <button type="button" className="forum-reply-toggle" aria-expanded={expand}
            onClick={() => (expand ? onCollapse() : onExpand())}>
            {expand ? <IconChevronUp size={14} aria-hidden="true" /> : <IconChevronDown size={14} aria-hidden="true" />}
            {expand ? 'Ẩn trả lời' : `Xem ${root.replyCount} trả lời`}
          </button>
        </div> : null}

        {expand ? (
          <div className="forum-replies sc-replies">
            {repliesQuery.isLoading ? <Text size="xs" c="dimmed">Đang tải trả lời…</Text> : null}
            {repliesQuery.isError ? <ErrorState error={repliesQuery.error} onRetry={() => repliesQuery.refetch()} /> : null}
            {replies.map((reply) => <CommentRow key={reply.commentId} comment={reply} {...props} />)}
            {repliesQuery.hasNextPage ? <Button size="compact-xs" variant="light" loading={repliesQuery.isFetchingNextPage}
              onClick={() => repliesQuery.fetchNextPage()}>Tải thêm trả lời</Button> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function CommentRow({ comment, currentUserId, locked, topicId, onReply, onEdit, onDelete, onLike, onReport, onPermalink, root }: ThreadProps & { comment: Comment }) {
  const isOwner = Boolean(currentUserId && comment.author?.userId === currentUserId);
  const anchor = `comment-${comment.commentId}`;
  const isReply = comment.commentId !== root.commentId;
  if (comment.status === 'DELETED') return <div className="forum-comment forum-comment-deleted sc-comment sc-comment--deleted" tabIndex={-1} id={anchor}>
    <Text size="sm" c="dimmed">Bình luận đã bị xóa.</Text>
  </div>;
  return (
    <div className={`forum-comment sc-comment${isReply ? ' sc-comment--reply' : ''}${isOwner ? ' sc-comment--own' : ''}`}
      tabIndex={-1} id={anchor} data-category={root.author?.role === 'AUTHOR' ? 'author' : undefined}
      aria-label={`Bình luận của ${authorName(comment.author)}`}>
      <div className="forum-comment-grid">
        <div className="forum-comment-main">
          <div className="forum-comment-meta sc-comment-meta">
            <AuthorLink author={comment.author} compact />
            {isOwner ? <span className="forum-badge" data-tone="muted">Bạn</span> : null}
            <span className="sc-byline-dot" aria-hidden="true">·</span>
            <time className="forum-time" dateTime={comment.createdAt} title={formatDate(comment.createdAt)}>{relativeTime(comment.createdAt)}</time>
            {comment.editedAt ? <><span className="sc-byline-dot" aria-hidden="true">·</span><span className="forum-time">đã sửa</span></> : null}
          </div>
          {comment.replyToId && comment.replyToId !== root.commentId ? <Link className="forum-reply-ref" to={`/discussions/${topicId}?commentId=${comment.replyToId}#comment-${comment.replyToId}`}>
            <IconArrowBackUp size={13} aria-hidden="true" /> Xem bình luận được trả lời</Link> : null}
          <div className="sc-comment-body"><DiscussionBody text={comment.body} /></div>
          <div className="forum-comment-actions sc-comment-actions">
            <button type="button" className="forum-stat" data-active={comment.viewerLiked || undefined} aria-pressed={comment.viewerLiked}
              aria-label={comment.viewerLiked ? `Bỏ thích bình luận (${comment.likeCount})` : `Thích bình luận (${comment.likeCount})`}
              disabled={!currentUserId || (locked && !comment.viewerLiked)} onClick={() => onLike(comment)}>
              <IconHeart size={14} aria-hidden="true" /> {comment.likeCount}
            </button>
            {currentUserId && !locked && root.status !== 'DELETED' ? <button type="button" className="forum-stat"
              onClick={() => onReply({ rootId: root.commentId, replyToId: comment.commentId, name: authorName(comment.author) })}>
              <IconMessage size={14} aria-hidden="true" /> Trả lời
            </button> : null}
            <AnimatedMenu>
              <AnimatedMenu.Target><button type="button" className="forum-icon-btn" aria-label={`Tùy chọn bình luận của ${authorName(comment.author)}`}><IconDots size={16} aria-hidden="true" /></button></AnimatedMenu.Target>
              <AnimatedMenu.Dropdown>
                <AnimatedMenu.Item leftSection={<IconLink size={15} />} onClick={() => onPermalink(comment.commentId)}>Sao chép liên kết</AnimatedMenu.Item>
                {isOwner && !locked ? <AnimatedMenu.Item leftSection={<IconPencil size={15} />} onClick={() => onEdit(comment)}>Sửa</AnimatedMenu.Item> : null}
                {isOwner ? <AnimatedMenu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => onDelete(comment)}>Xóa</AnimatedMenu.Item> : null}
                {currentUserId && !isOwner ? <AnimatedMenu.Item leftSection={<IconReportAnalytics size={15} />} onClick={() => onReport(comment)}>Báo cáo</AnimatedMenu.Item> : null}
                {!currentUserId ? <AnimatedMenu.Item component={Link} to="/login" leftSection={<IconLock size={15} />}>Đăng nhập để tương tác</AnimatedMenu.Item> : null}
              </AnimatedMenu.Dropdown>
            </AnimatedMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * StoryCraft editorial styling (scoped to this page's hooks).
 * Conservative, dependency-free CSS-in-JSX via a plain <style> element would
 * be off-pattern, so presentation is expressed with class hooks consumed by
 * the existing forum stylesheet. The block below documents the contract.
 *
 * .sc-editorial-topic        page scope + data-category
 * .sc-paper                  paper surface for the article
 * .forum-ribbon              small category label ribbon w/ icon + flag
 * .sc-headline               display headline (68–74ch measure)
 * .sc-byline / .sc-byline-dot
 * .sc-rule[data-tone]        hairline rule tinted by category tone
 * .sc-prose-measure          68–74ch body measure
 * .sc-article-footer         compact reaction footer
 * .sc-thread-divider         visual separation article ↔ replies
 * .sc-discussion             warm surface discussion section
 * .sc-discussion-box         composer panel w/ label
 * .sc-timeline / .sc-timeline-rail  comment timeline rail
 * .sc-thread / .sc-thread-node / .sc-thread-panel  thread panel + guide
 * .sc-replies                nested reply guide
 * .sc-comment / --reply / --own / --deleted
 * ------------------------------------------------------------------------- */
