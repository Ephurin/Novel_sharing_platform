import { Alert, Avatar, Button, Group, Pagination, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { apiClient, getApiErrorMessage, type ApiEnvelope } from '../../shared/api/api-client';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useAuthStore } from '../auth/useAuthStore';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { CommentIcon } from './CommentComposer';
import { CommentMentionInput } from './CommentMentionInput';
import { useCommentEditor } from './useCommentEditor';
import { CommentThread } from './CommentsSection';
import type { CommentInput, ReaderChapter, ReaderComment } from './reader-api';
import { listCommentReplies, replyToComment, type CommentTarget } from './comments-api';

export type PrivateComment = ReaderComment & { audience: string; anchor?: { quote: string; detached: boolean; currentParagraphId: string | null; paragraphId: string } | null };
const policy = { gcTime: 0, staleTime: 0, retry: false, refetchOnWindowFocus: 'always' as const, refetchInterval: 15000 };
async function list(url: string, params: Record<string, unknown>) {
  const response = await apiClient.get<ApiEnvelope<PrivateComment[]>>(url, { params });
  return { items: response.data.data, pages: Number(response.data.meta.totalPages) || 1, count: Number(response.data.meta.totalItems) };
}
export function usePrivateCommentFocus(target: CommentTarget) {
  const account = useAuthStore(s => s.user?.userId);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const threadId = params.get('threadId');
  const focusId = params.get('commentId') || threadId;
  const query = useQuery({
    queryKey: ['private-comments', account, 'focus', target.kind, target.id, threadId, focusId],
    enabled: Boolean(account && threadId),
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<{ root: PrivateComment }>>(`/comments/${focusId}/thread`, { params: { limit: 5 } });
      const root = response.data.data.root;
      if (root.audience === 'PUBLIC' || root.commentId !== threadId ||
        (target.kind === 'chapter' ? root.chapterId !== target.id : root.novelId !== target.id || root.chapterId !== null)) {
        throw new Error('Private thread does not belong to this page.');
      }
      return { root, page: Number(response.data.meta.page) || 1 };
    },
    ...policy
  });
  return { ...query, requested: Boolean(account && threadId), focusId, navigationKey: location.key };
}

type PrivateFocus = ReturnType<typeof usePrivateCommentFocus>;
const friendChannels = ['FRIENDS_ALL', 'FRIENDS_SELECTED'] as const;

export function useChapterDiscussions(chapter: ReaderChapter) {
  const account = useAuthStore(s => s.user?.userId);
  return useQuery({
    queryKey: ['private-comments', account, 'chapter-discussions', chapter.chapterId, chapter.contentVersion],
    enabled: Boolean(account && chapter.contentVersion),
    ...policy,
    queryFn: async () => {
      const groups = new Map<string, PrivateComment[]>();
      const detached: PrivateComment[] = [];
      await Promise.all(friendChannels.map(async channel => {
        let page = 1;
        let pages = 1;
        do {
          const result = await list(`/chapters/${chapter.chapterId}/comments`, { channel, page, limit: 100 });
          pages = result.pages;
          for (const item of result.items) {
            const id = !item.anchor?.detached && item.anchor?.currentParagraphId;
            if (!id) { if (item.anchor?.detached) detached.push(item); continue; }
            const group = groups.get(id) ?? [];
            group.push(item);
            groups.set(id, group);
          }
        } while (++page <= pages);
      }));
      for (const group of groups.values()) group.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      detached.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { groups, detached };
    }
  });
}

function usePrivateRefresh() {
  const client = useQueryClient();
  return async () => {
    await client.invalidateQueries({ queryKey: ['private-comments'] });
    await client.invalidateQueries({ queryKey: ['comment-replies'] });
  };
}

function FocusedPrivateThread({ focus, onChanged, showContext }: {
  focus: PrivateFocus; onChanged: () => Promise<unknown>; showContext?: boolean;
}) {
  if (focus.isError) return <ErrorState title="Không còn quyền xem cuộc trao đổi này" error={focus.error} onRetry={() => void focus.refetch()} />;
  if (focus.isPending || !focus.data) return <Text size="sm" role="status">Đang tải cuộc trao đổi…</Text>;
  const { root, page } = focus.data;
  return <Stack gap="xs">
    {root.anchor?.detached && <Text size="sm" c="dimmed">Đoạn gốc đã thay đổi: {root.anchor.quote}</Text>}
    <CommentThread comment={root} onChanged={onChanged} showContext={showContext}
      focus={{ commentId: focus.focusId!, replyPage: page, key: focus.navigationKey }} />
  </Stack>;
}

function ChatIdentity({ name, avatar }: { name: string; avatar?: string | null }) {
  return <Group gap={8} wrap="nowrap">
    <Avatar src={avatar} size={28} radius="xl" aria-hidden="true">{name[0]?.toUpperCase() ?? '?'}</Avatar>
    <Text size="sm" fw={600} className="sc-private-chat-name">{name}</Text>
  </Group>;
}

function PrivateComposer({ target, anchor, author = false, replyTo, onSent, onCancel }: {
  target: CommentTarget; anchor?: { contentVersion: string; paragraphId: string }; author?: boolean;
  replyTo?: string; onSent?: () => void; onCancel?: () => void;
}) {
  const user = useAuthStore(s => s.user);
  const account = user?.userId;
  const [draft, setDraft] = useState<CommentInput>({ content: '', mentions: [] });
  const [hasSelectedRecipients, setHasSelectedRecipients] = useState(false);
  const chooseAudience = !author && !replyTo;
  const mentions = draft.mentions ?? [];
  const recipients = chooseAudience ? [...new Set(mentions.map(mention => mention.userId))] : [];
  const missingSelection = chooseAudience && Array.from(draft.content.matchAll(/(?:^|[\s(\[{“‘"'])(@[a-zA-Z0-9_]*)/g)).some(match => {
    const start = match.index + match[0].length - match[1].length;
    return !mentions.some(mention => mention.start === start && mention.end === start + match[1].length);
  });
  const removedAll = hasSelectedRecipients && !recipients.length;
  const refresh = usePrivateRefresh();
  const create = useMutation({
    mutationFn: async ({ content, recipients }: { content: string; recipients: string[] }) => {
      if (!account || useAuthStore.getState().user?.userId !== account || (!replyTo && !author && !anchor)) {
        throw new Error('Kiểm tra người nhận và đoạn trước khi gửi.');
      }
      if (replyTo) { await replyToComment(replyTo, { content }); return; }
      const url = `/${target.kind === 'chapter' ? 'chapters' : 'novels'}/${target.id}/comments`;
      await apiClient.post(url, {
        content, audience: author ? 'AUTHOR_PRIVATE' : recipients.length ? 'FRIENDS_SELECTED' : 'FRIENDS_ALL',
        ...(anchor ? { anchor } : {}),
        ...(recipients.length ? { recipientUserIds: recipients } : {})
      });
    },
    onSuccess: async () => {
      setDraft({ content: '', mentions: [] });
      setHasSelectedRecipients(false);
      onSent?.();
      await refresh();
    }
  });
  const editorId = useId();
  const { editor, formatting, limitReached } = useCommentEditor({
    value: draft.content, mentions: draft.mentions, id: editorId,
    label: replyTo ? 'Trả lời bình luận' : 'Nội dung riêng',
    placeholder: replyTo ? 'Viết trả lời…' : 'Viết tin nhắn…',
    disabled: create.isPending,
    onChange: value => {
      setDraft(value);
      if (chooseAudience && value.mentions.length) setHasSelectedRecipients(true);
    }
  });
  if (user?.status !== 'ACTIVE') return null;
  const disabled = create.isPending || !draft.content.trim() || missingSelection || removedAll;
  return <Stack component="form" gap={8} className="sc-private-chat-compose" onSubmit={event => {
    event.preventDefault();
    if (!disabled) create.mutate({ content: draft.content.trim(), recipients });
  }}>
    <CommentMentionInput editor={editor} trigger={formatting?.mention} enabled={chooseAudience && !create.isPending}
      mentionCount={mentions.length} recipientPicker={chooseAudience} />
    {limitReached && <Text size="xs" role="alert">Tối đa 2.000 ký tự.</Text>}
    <Group gap={8} justify="space-between" wrap="nowrap">
      {chooseAudience && (!missingSelection && removedAll
        ? <Button type="button" size="compact-xs" variant="subtle" onClick={() => setHasSelectedRecipients(false)}>Chuyển sang tất cả bạn bè</Button>
        : <Text size="xs" c="dimmed" aria-live="polite">
          {missingSelection ? 'Chọn người nhận trong gợi ý.' : recipients.length ? `Chỉ ${recipients.length} bạn được chọn` : null}
        </Text>)}
      <Group className="sc-private-chat-actions" gap={6} wrap="nowrap">
        {onCancel && <Button variant="subtle" size="compact-sm" type="button" disabled={create.isPending} onClick={onCancel}>Hủy</Button>}
        <Button className="sc-private-chat-send" size="compact-sm" type="submit" loading={create.isPending} disabled={disabled}
          aria-label={replyTo ? 'Gửi trả lời' : 'Gửi riêng'} title={replyTo ? 'Gửi trả lời' : 'Gửi riêng'}><CommentIcon name="send" /></Button>
      </Group>
    </Group>
    {create.isError && <Alert color="red">{getApiErrorMessage(create.error)}</Alert>}
  </Stack>;
}

function ChatMessage({ message, focused = false, spoiler = false }: { message: ReaderComment; focused?: boolean; spoiler?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const item = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focused) return;
    const frame = requestAnimationFrame(() => {
      item.current?.scrollIntoView({ block: 'nearest' });
      item.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  return <article ref={item} className={`sc-private-chat-message${focused ? ' is-focused' : ''}`} tabIndex={focused ? -1 : undefined}>
    <ChatIdentity name={message.displayName} avatar={message.avatarUrl} />
    {message.status !== 'APPROVED' && <Text size="xs" c="dimmed">
      {message.status === 'REJECTED' ? 'Không được duyệt' : 'Đang chờ duyệt'}
    </Text>}
    {(message.isSpoiler || spoiler) && !revealed ? <Button size="compact-xs" variant="subtle" onClick={() => setRevealed(true)}>
      Hiện nội dung có spoiler
    </Button> : <ManuscriptContent content={message.content} />}
  </article>;
}

async function loadChatReplies(rootId: string) {
  const messages: ReaderComment[] = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await listCommentReplies(rootId, page);
    messages.push(...result.items);
    pages = result.totalPages;
  } while (++page <= pages);
  return messages;
}

export function ParagraphDiscussion({ chapter, paragraphId, focus, discussions, onCancel }: {
  chapter: ReaderChapter; paragraphId?: string; focus?: PrivateFocus; discussions: ReturnType<typeof useChapterDiscussions>; onCancel: () => void;
}) {
  const account = useAuthStore(s => s.user?.userId);
  const [showDetached, setShowDetached] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [followLatest, setFollowLatest] = useState(false);
  const data = discussions.isError ? undefined : discussions.data;
  const focusedRoot = !focus?.isError ? focus?.data?.root : undefined;
  const roots = showDetached ? data?.detached ?? [] : paragraphId ? data?.groups.get(paragraphId) ?? [] : [];
  const visibleRoots = focusedRoot && !roots.some(root => root.commentId === focusedRoot.commentId)
    ? [...roots, focusedRoot] : roots;
  const replies = useQueries({
    queries: visibleRoots.map(root => ({
      queryKey: ['comment-replies', root.commentId, account, root.audience, 'chat-history'],
      queryFn: () => loadChatReplies(root.commentId),
      enabled: root.repliesCount > 0,
      ...policy
    }))
  });
  const messages = visibleRoots.flatMap((root, index) => {
    const result = replies[index];
    if (result.isError) return [];
    return [
      { message: root as ReaderComment, spoiler: false, detachedQuote: root.anchor?.detached ? root.anchor.quote : undefined },
      ...(result.data ?? []).map(message => ({ message, spoiler: Boolean(root.isSpoiler), detachedQuote: undefined }))
    ];
  }).sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt) || a.message.commentId.localeCompare(b.message.commentId));
  const latest = messages.at(-1)?.message.commentId;
  const focusId = !followLatest && !focus?.isError ? focus?.focusId : undefined;
  const target: CommentTarget = { kind: 'chapter', id: chapter.chapterId };
  useEffect(() => {
    if (!focusId && stickToBottom.current && history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [latest, messages.length, focusId]);

  return <div className="sc-paragraph-chat">
    <div ref={history} className="sc-paragraph-chat-history" onScroll={event => {
      const element = event.currentTarget;
      stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    }}>
      <Stack gap="xs">
        {focus?.isError && <ErrorState title="Không còn quyền xem cuộc trao đổi này" error={focus.error} onRetry={() => void focus.refetch()} />}
        {focus?.isPending && <Text size="sm" role="status">Đang tải cuộc trao đổi…</Text>}
        {paragraphId && discussions.isPending && <Text size="sm" role="status">Đang tải trao đổi…</Text>}
        {paragraphId && discussions.isError && <ErrorState title="Không tải được trao đổi" error={discussions.error} onRetry={() => void discussions.refetch()} />}
        {replies.some((result, index) => visibleRoots[index].repliesCount > 0 && result.isPending) &&
          <Text size="xs" c="dimmed" role="status">Đang tải tin nhắn…</Text>}
        {messages.map(({ message, spoiler, detachedQuote }) => <Stack key={message.commentId} gap={4}>
          {detachedQuote && <Text size="sm" c="dimmed">Đoạn gốc đã thay đổi: {detachedQuote}</Text>}
          <ChatMessage message={message} spoiler={spoiler} focused={focusId === message.commentId} />
        </Stack>)}
        {paragraphId && Boolean(data?.detached.length) && <Button variant="subtle" size="compact-sm" aria-pressed={showDetached}
          onClick={() => { stickToBottom.current = true; setShowDetached(value => !value); }}>
          {showDetached ? 'Về đoạn đang chọn' : 'Xem trao đổi ở đoạn đã thay đổi'}
        </Button>}
      </Stack>
    </div>
    {!showDetached && !focus?.isError && (focusedRoot?.canReply || (!focus && paragraphId && chapter.contentVersion)) &&
      <div className="sc-paragraph-chat-footer">
        <PrivateComposer target={target} replyTo={focusedRoot?.commentId} onCancel={onCancel}
          anchor={paragraphId && chapter.contentVersion ? { contentVersion: chapter.contentVersion, paragraphId } : undefined}
          onSent={() => {
            stickToBottom.current = true;
            setFollowLatest(true);
            if (history.current) history.current.scrollTop = history.current.scrollHeight;
          }} />
      </div>}
  </div>;
}

export function AuthorPrivateFeedback({ target, chapter }: { target: CommentTarget; chapter?: ReaderChapter }) {
  const account = useAuthStore(s => s.user?.userId);
  return account ? <AuthorPrivateSession key={`${account}:${target.kind}:${target.id}`} target={target} chapter={chapter} account={account} /> : null;
}

function AuthorPrivateSession({ target, chapter, account }: { target: CommentTarget; chapter?: ReaderChapter; account: string }) {
  const active = useAuthStore(s => s.user?.status === 'ACTIVE');
  const focus = usePrivateCommentFocus(target);
  const authorNotification = focus.requested && focus.data?.root.audience === 'AUTHOR_PRIVATE';
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [paragraphId, setParagraphId] = useState<string | null>(null);
  useEffect(() => { if (authorNotification) setOpen(true); }, [authorNotification, focus.navigationKey]);
  const query = useQuery({
    queryKey: ['private-comments', account, target.kind, target.id, 'AUTHOR_PRIVATE', page],
    queryFn: () => list(`/${target.kind === 'chapter' ? 'chapters' : 'novels'}/${target.id}/comments`, { channel: 'AUTHOR_PRIVATE', page, limit: 10 }),
    enabled: open,
    ...policy
  });
  const refresh = usePrivateRefresh();
  return <Stack gap="xs">
    <Button variant={open ? 'light' : 'default'} size="compact-sm" aria-expanded={open} style={{ alignSelf: 'flex-start' }}
      onClick={() => setOpen(value => !value)}>Nhắn riêng cho tác giả</Button>
    {target.kind === 'novel' && focus.requested && !authorNotification && (focus.isPending || focus.isError) &&
      <FocusedPrivateThread focus={focus} onChanged={refresh} />}
    {open && <Stack id="reader-author-feedback" className="sc-author-feedback-inline" gap="sm">
      {chapter?.paragraphs?.length && active ? <Select aria-label="Đoạn góp ý" placeholder="Toàn chương"
        searchable clearable value={paragraphId} onChange={setParagraphId}
        data={chapter.paragraphs.map(p => ({ value: p.paragraphId, label: `${p.paragraphIndex + 1}. ${p.text.slice(0, 90)}` }))} /> : null}
      <PrivateComposer target={target} author onCancel={() => setOpen(false)}
        anchor={chapter?.contentVersion && paragraphId ? { contentVersion: chapter.contentVersion, paragraphId } : undefined} />
      {authorNotification && <FocusedPrivateThread focus={focus} onChanged={refresh} />}
      {query.isPending && <Text size="sm" role="status">Đang tải góp ý…</Text>}
      {query.isError && <ErrorState title="Không tải được góp ý" error={query.error} onRetry={() => void query.refetch()} />}
      {!query.isError && query.data?.items.filter(comment => comment.commentId !== focus.data?.root.commentId).map(comment =>
        <Stack key={comment.commentId} gap="xs">
          {comment.anchor && <Text size="sm" c="dimmed">{comment.anchor.detached ? 'Đoạn gốc đã thay đổi: ' : 'Đoạn: '}{comment.anchor.quote}</Text>}
          <CommentThread comment={comment} onChanged={refresh} />
        </Stack>)}
      {!query.isError && query.data && query.data.pages > 1 && <Pagination total={query.data.pages} value={page} onChange={setPage} />}
    </Stack>}
  </Stack>;
}
export function FeedbackPage({ novelId, box = 'sent' }: { novelId?: string; box?: 'sent' | 'received' }) {
  const account = useAuthStore(s => s.user?.userId); const [page, setPage] = useState(1); const client = useQueryClient();
  const query = useQuery({ queryKey: ['private-comments', account, 'feedback', novelId, box, page], queryFn: () => list('/author-feedback', { novelId, box, page, limit: 10 }), enabled: Boolean(account), ...policy });
  return <Stack><Title order={2}>{box === 'sent' ? 'Góp ý đã gửi' : 'Góp ý riêng'}</Title>{query.isPending && <LoadingState />}{query.isError && <ErrorState title="Không tải được góp ý" error={query.error} onRetry={() => void query.refetch()} />}{!query.isError && query.data?.items.map(comment => <CommentThread key={`${account}:${comment.commentId}`} comment={comment} onChanged={() => client.invalidateQueries()} />)}{query.data?.items.length === 0 && <Text c="dimmed">Chưa có góp ý.</Text>}{query.data && query.data.pages > 1 && <Pagination total={query.data.pages} value={page} onChange={setPage} />}</Stack>;
}
