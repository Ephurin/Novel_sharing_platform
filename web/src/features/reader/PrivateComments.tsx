import { Alert, Avatar, Button, Group, Menu, Pagination, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { apiClient, getApiErrorMessage, type ApiEnvelope } from '../../shared/api/api-client';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useAuthStore } from '../auth/useAuthStore';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { CommentIcon } from './CommentComposer';
import { useCommentManagement } from './CommentManagement';
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

async function listChapterPrivateRoots(chapterId: string, channel: typeof friendChannels[number] | 'AUTHOR_PRIVATE') {
  const roots: PrivateComment[] = [];
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const result = await list(`/chapters/${chapterId}/comments`, { channel, page, limit: 100 });
    pages = result.pages;
    roots.push(...result.items);
  }
  return roots;
}

export function useChapterDiscussions(chapter: ReaderChapter) {
  const account = useAuthStore(s => s.user?.userId);
  return useQuery({
    queryKey: ['private-comments', account, 'chapter-discussions', chapter.chapterId, chapter.contentVersion],
    enabled: Boolean(account && chapter.contentVersion),
    ...policy,
    queryFn: async () => {
      const groups = new Map<string, PrivateComment[]>();
      const detached: PrivateComment[] = [];
      const roots = await Promise.all(friendChannels.map(channel => listChapterPrivateRoots(chapter.chapterId, channel)));
      for (const item of roots.flat()) {
        const id = !item.anchor?.detached && item.anchor?.currentParagraphId;
        if (!id) { if (item.anchor?.detached) detached.push(item); continue; }
        const group = groups.get(id) ?? [];
        group.push(item);
        groups.set(id, group);
      }
      for (const group of groups.values()) group.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      detached.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { groups, detached };
    }
  });
}

export function useChapterAuthorFeedback(chapter?: ReaderChapter, enabled = true) {
  const account = useAuthStore(s => s.user?.userId);
  return useQuery({
    queryKey: ['private-comments', account, 'chapter-author-feedback', chapter?.chapterId, chapter?.contentVersion],
    enabled: Boolean(enabled && account && chapter?.contentVersion),
    ...policy,
    queryFn: async () => {
      const groups = new Map<string, PrivateComment[]>();
      for (const item of await listChapterPrivateRoots(chapter!.chapterId, 'AUTHOR_PRIVATE')) {
        const { anchor } = item;
        const id = !anchor?.detached && anchor?.currentParagraphId;
        if (!id) continue;
        const group = groups.get(id) ?? [];
        group.push(item);
        groups.set(id, group);
      }
      return groups;
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

type PrivateDraft = { content: string; mentions: NonNullable<CommentInput['mentions']>; hasSelectedRecipients: boolean };
const emptyPrivateDraft: PrivateDraft = { content: '', mentions: [], hasSelectedRecipients: false };

function PrivateComposer({ target, anchor, author = false, replyTo, savedDraft, onSendingChange, onSent, onCancel }: {
  target: CommentTarget; anchor?: { contentVersion: string; paragraphId: string }; author?: boolean;
  replyTo?: { message: ReaderComment; audience: string }; onSent?: () => void; onCancel?: () => void;
  savedDraft?: { value: PrivateDraft; save: (value: PrivateDraft) => void };
  onSendingChange?: (sending: boolean) => void;
}) {
  const user = useAuthStore(s => s.user);
  const account = user?.userId;
  const [localDraft, setLocalDraft] = useState(emptyPrivateDraft);
  const draft = savedDraft?.value ?? localDraft;
  const setDraft = savedDraft?.save ?? setLocalDraft;
  const sending = useRef(false);
  const chooseAudience = !author && !replyTo;
  const { mentions, hasSelectedRecipients } = draft;
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
      if (replyTo) { await replyToComment(replyTo.message.commentId, { content }); return; }
      const url = `/${target.kind === 'chapter' ? 'chapters' : 'novels'}/${target.id}/comments`;
      await apiClient.post(url, {
        content, audience: author ? 'AUTHOR_PRIVATE' : recipients.length ? 'FRIENDS_SELECTED' : 'FRIENDS_ALL',
        ...(anchor ? { anchor } : {}),
        ...(recipients.length ? { recipientUserIds: recipients } : {})
      });
    },
    onSuccess: async () => {
      setDraft(emptyPrivateDraft);
      onSent?.();
      await refresh();
    },
    onSettled: () => { sending.current = false; onSendingChange?.(false); }
  });
  const editorId = useId();
  const { editor, formatting, limitReached } = useCommentEditor({
    value: draft.content, mentions: draft.mentions, id: editorId,
    label: replyTo ? 'Trả lời bình luận' : 'Nội dung riêng',
    placeholder: replyTo ? 'Viết trả lời…' : 'Viết tin nhắn…',
    disabled: create.isPending,
    onChange: value => setDraft({ ...value, hasSelectedRecipients: hasSelectedRecipients || (chooseAudience && value.mentions.length > 0) })
  });
  if (user?.status !== 'ACTIVE') return null;
  const disabled = create.isPending || !draft.content.trim() || missingSelection || removedAll;
  return <Stack component="form" gap={8} className="sc-private-chat-compose" onSubmit={event => {
    event.preventDefault();
    if (disabled || sending.current) return;
    sending.current = true;
    onSendingChange?.(true);
    create.mutate({ content: draft.content.trim(), recipients });
  }}>
    {replyTo && <Text size="xs" c="dimmed">
      Trả lời {replyTo.message.displayName} · {replyTo.audience === 'FRIENDS_SELECTED' ? 'Chỉ bạn bè được chọn' : 'Nhóm bạn bè của tin nhắn gốc'}
    </Text>}
    <CommentMentionInput editor={editor} trigger={formatting?.mention} enabled={chooseAudience && !create.isPending}
      mentionCount={mentions.length} recipientPicker={chooseAudience} />
    {limitReached && <Text size="xs" role="alert">Tối đa 2.000 ký tự.</Text>}
    <Group gap={8} justify="space-between" wrap="nowrap">
      {chooseAudience && (!missingSelection && removedAll
        ? <Button type="button" size="compact-xs" variant="subtle" onClick={() => setDraft({ ...draft, hasSelectedRecipients: false })}>Chuyển sang tất cả bạn bè</Button>
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

function ChatMessage({ message, focused = false, spoiler = false, sending, onReply, onChanged }: {
  message: ReaderComment; focused?: boolean; spoiler?: boolean; sending: boolean; onReply?: () => void; onChanged: () => Promise<unknown>;
}) {
  const [revealed, setRevealed] = useState(false);
  const management = useCommentManagement(message, onChanged);
  const hasActions = management.canEdit || management.canDelete || management.canReport;
  const item = useRef<HTMLElement>(null);
  useEffect(() => setRevealed(false), [message.content, message.isSpoiler, spoiler]);
  useEffect(() => {
    if (!focused) return;
    const frame = requestAnimationFrame(() => {
      item.current?.scrollIntoView({ block: 'nearest' });
      item.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  return <article ref={item} className={`sc-private-chat-message${focused ? ' is-focused' : ''}`} tabIndex={focused ? -1 : undefined}>
    <Group justify="space-between" gap={8} wrap="nowrap">
      <ChatIdentity name={message.displayName} avatar={message.avatarUrl} />
      {!management.action && <Group gap={4} wrap="nowrap">
        {onReply && <Button type="button" variant="subtle" size="compact-xs" className="sc-private-chat-action" disabled={sending}
          aria-label={`Trả lời ${message.displayName}`} title={`Trả lời ${message.displayName}`} onClick={onReply}>
          <CommentIcon name="reply" />
        </Button>}
        {hasActions && <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button type="button" variant="subtle" size="compact-xs" className="sc-private-chat-action" disabled={sending || management.busy}
              aria-label={`Thao tác với tin nhắn của ${message.displayName}`} title="Thao tác với tin nhắn">
              <CommentIcon name="more_horiz" />
            </Button>
          </Menu.Target>
          <Menu.Dropdown data-private-chat-overlay>
            {management.canEdit && <Menu.Item onClick={() => management.open('edit')}>Sửa</Menu.Item>}
            {management.canDelete && <Menu.Item color="red" onClick={() => management.open('delete')}>Xóa</Menu.Item>}
            {management.canReport && <Menu.Item disabled={management.reported} onClick={() => management.open('report')}>Báo cáo</Menu.Item>}
          </Menu.Dropdown>
        </Menu>}
      </Group>}
    </Group>
    {message.status !== 'APPROVED' && <Text size="xs" c="dimmed">
      {message.status === 'REJECTED' ? 'Không được duyệt' : 'Đang chờ duyệt'}
    </Text>}
    {management.action !== 'edit' && ((message.isSpoiler || spoiler) && !revealed ? <Button size="compact-xs" variant="subtle" onClick={() => setRevealed(true)}>
      Hiện nội dung có spoiler
    </Button> : <ManuscriptContent content={message.content} />)}
    {management.form}
    {management.feedback}
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

export function ParagraphDiscussion({ chapter, paragraphId, focus, discussions, onCancel, onOpenAuthorFeedback }: {
  chapter: ReaderChapter; paragraphId?: string; focus?: PrivateFocus; discussions: ReturnType<typeof useChapterDiscussions>; onCancel: () => void;
  onOpenAuthorFeedback?: () => void;
}) {
  const account = useAuthStore(s => s.user?.userId);
  const active = useAuthStore(s => s.user?.status === 'ACTIVE');
  const [replyId, setReplyId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, PrivateDraft>>({});
  const [sending, setSending] = useState(false);
  const refresh = usePrivateRefresh();
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
      queryKey: ['comment-replies', root.commentId, account, root.audience, 'chat-history', root.repliesCount],
      queryFn: () => loadChatReplies(root.commentId),
      enabled: root.repliesCount > 0,
      ...policy
    }))
  });
  const messages = visibleRoots.flatMap((root, index) => {
    const result = replies[index];
    if (result.isError) return [];
    const visibleReplies = root.repliesCount > 0 ? result.data ?? [] : [];
    return [
      { message: root as ReaderComment, root, spoiler: false, detachedQuote: root.anchor?.detached ? root.anchor.quote : undefined },
      ...visibleReplies.map(message => ({ message, root, spoiler: Boolean(root.isSpoiler), detachedQuote: undefined }))
    ];
  }).sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt) || a.message.commentId.localeCompare(b.message.commentId));
  const latest = messages.at(-1)?.message.commentId;
  const focusId = !followLatest && !focus?.isError ? focus?.focusId : undefined;
  const target: CommentTarget = { kind: 'chapter', id: chapter.chapterId };
  const selected = messages.find(({ message, root }) => message.commentId === replyId && message.canReply && root.canReply);
  const replyTo = selected ? { message: selected.message, audience: selected.root.audience }
    : !replyId && focusedRoot?.canReply ? { message: focusedRoot, audience: focusedRoot.audience } : undefined;
  const canStart = !replyId && !focus && paragraphId && chapter.contentVersion;
  const draftKey = replyTo?.message.commentId ?? 'new';
  useEffect(() => {
    if (!focusId && stickToBottom.current && history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [latest, messages.length, focusId]);

  return <div className="sc-paragraph-chat">
    {onOpenAuthorFeedback && <Button className="sc-private-chat-back" variant="subtle" size="compact-sm" disabled={sending}
      onClick={onOpenAuthorFeedback}>Xem góp ý riêng cho tác giả</Button>}
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
        {messages.map(({ message, root, spoiler, detachedQuote }) => <Stack key={message.commentId} gap={4}>
          {detachedQuote && <Text size="sm" c="dimmed">Đoạn gốc đã thay đổi: {detachedQuote}</Text>}
          <ChatMessage message={message} spoiler={spoiler} focused={focusId === message.commentId} sending={sending} onChanged={refresh}
            onReply={active && !showDetached && !focus?.isError && root.canReply && message.canReply ? () => setReplyId(message.commentId) : undefined} />
        </Stack>)}
        {paragraphId && Boolean(data?.detached.length) && <Button variant="subtle" size="compact-sm" aria-pressed={showDetached} disabled={sending}
          onClick={() => { stickToBottom.current = true; setReplyId(undefined); setShowDetached(value => !value); }}>
          {showDetached ? 'Về đoạn đang chọn' : 'Xem trao đổi ở đoạn đã thay đổi'}
        </Button>}
      </Stack>
    </div>
    {!showDetached && !focus?.isError && (replyTo || canStart || replyId) &&
      <div className="sc-paragraph-chat-footer">
        {replyId && !replyTo ? <Group justify="space-between" gap={8}>
          <Text size="xs" role="status">Tin nhắn này không còn khả dụng.</Text>
          <Button type="button" size="compact-sm" variant="subtle" disabled={sending} onClick={() => setReplyId(undefined)}>Hủy</Button>
        </Group> : <PrivateComposer key={draftKey} target={target} replyTo={replyTo}
          savedDraft={{ value: drafts[draftKey] ?? emptyPrivateDraft, save: value => setDrafts(current => ({ ...current, [draftKey]: value })) }}
          onSendingChange={setSending}
          onCancel={replyId ? () => setReplyId(undefined) : onCancel}
          anchor={paragraphId && chapter.contentVersion ? { contentVersion: chapter.contentVersion, paragraphId } : undefined}
          onSent={() => {
            stickToBottom.current = true;
            setFollowLatest(true);
            if (history.current) history.current.scrollTop = history.current.scrollHeight;
          }} />}
      </div>}
  </div>;
}

type AuthorFeedbackRequest = { paragraphId: string };

export function AuthorPrivateFeedback({ target, chapter, requestedFeedback }: {
  target: CommentTarget; chapter?: ReaderChapter; requestedFeedback?: AuthorFeedbackRequest;
}) {
  const account = useAuthStore(s => s.user?.userId);
  return account ? <AuthorPrivateSession key={`${account}:${target.kind}:${target.id}`} target={target} chapter={chapter}
    account={account} requestedFeedback={requestedFeedback} /> : null;
}

function AuthorPrivateSession({ target, chapter, account, requestedFeedback }: {
  target: CommentTarget; chapter?: ReaderChapter; account: string; requestedFeedback?: AuthorFeedbackRequest;
}) {
  const active = useAuthStore(s => s.user?.status === 'ACTIVE');
  const focus = usePrivateCommentFocus(target);
  const authorNotification = focus.requested && focus.data?.root.audience === 'AUTHOR_PRIVATE';
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [paragraphId, setParagraphId] = useState<string | null>(null);
  const [listParagraphId, setListParagraphId] = useState<string>();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (authorNotification) {
      setListParagraphId(undefined);
      setPage(1);
      setOpen(true);
    }
  }, [authorNotification, focus.navigationKey]);
  useEffect(() => {
    if (!requestedFeedback) return;
    setListParagraphId(requestedFeedback.paragraphId);
    setPage(1);
    setOpen(true);
    const frame = requestAnimationFrame(() => {
      panel.current?.scrollIntoView({ block: 'start' });
      panel.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedFeedback]);
  const pageSize = 10;
  const query = useQuery({
    queryKey: ['private-comments', account, target.kind, target.id, 'AUTHOR_PRIVATE', page],
    queryFn: () => list(`/${target.kind === 'chapter' ? 'chapters' : 'novels'}/${target.id}/comments`, { channel: 'AUTHOR_PRIVATE', page, limit: pageSize }),
    enabled: open && !listParagraphId,
    ...policy
  });
  const anchored = useChapterAuthorFeedback(chapter, open && Boolean(listParagraphId));
  const activeList = listParagraphId ? anchored : query;
  const scopedItems = listParagraphId ? anchored.data?.get(listParagraphId) ?? [] : [];
  const totalPages = listParagraphId ? Math.max(1, Math.ceil(scopedItems.length / pageSize)) : query.data?.pages ?? 1;
  const currentPage = Math.min(page, totalPages);
  const items = listParagraphId ? scopedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize) : query.data?.items;
  const showFocusedThread = authorNotification && !listParagraphId;
  const refresh = usePrivateRefresh();
  return <Stack gap="xs">
    <Button variant={open ? 'light' : 'default'} size="compact-sm" aria-expanded={open} style={{ alignSelf: 'flex-start' }}
      onClick={() => setOpen(value => !value)}>Nhắn riêng cho tác giả</Button>
    {target.kind === 'novel' && focus.requested && !authorNotification && (focus.isPending || focus.isError) &&
      <FocusedPrivateThread focus={focus} onChanged={refresh} />}
    {open && <Stack ref={panel} id="reader-author-feedback" role="region" aria-label="Góp ý riêng cho tác giả"
      tabIndex={-1} className="sc-author-feedback-inline" gap="sm">
      {chapter?.paragraphs?.length && active ? <Select aria-label="Đoạn góp ý" placeholder="Toàn chương"
        searchable clearable value={paragraphId} onChange={setParagraphId}
        data={chapter.paragraphs.map(p => ({ value: p.paragraphId, label: `${p.paragraphIndex + 1}. ${p.text.slice(0, 90)}` }))} /> : null}
      <PrivateComposer target={target} author onCancel={() => setOpen(false)}
        anchor={chapter?.contentVersion && paragraphId ? { contentVersion: chapter.contentVersion, paragraphId } : undefined} />
      {listParagraphId && <Group justify="space-between" gap="xs">
        <Text size="sm" fw={600}>Góp ý cho đoạn đã chọn</Text>
        <Button variant="subtle" size="compact-sm" onClick={() => { setListParagraphId(undefined); setPage(1); }}>Xem góp ý cả chương</Button>
      </Group>}
      {showFocusedThread && <FocusedPrivateThread focus={focus} onChanged={refresh} />}
      {activeList.isPending && <Text size="sm" role="status">Đang tải góp ý…</Text>}
      {activeList.isError && <ErrorState title="Không tải được góp ý" error={activeList.error} onRetry={() => void activeList.refetch()} />}
      {listParagraphId && activeList.isSuccess && !items?.length && <Text size="sm" c="dimmed">Đoạn này chưa có góp ý.</Text>}
      {!activeList.isError && items?.filter(comment => !showFocusedThread || comment.commentId !== focus.data?.root.commentId).map(comment =>
        <Stack key={comment.commentId} gap="xs">
          {comment.anchor && <Text size="sm" c="dimmed">{comment.anchor.detached ? 'Đoạn gốc đã thay đổi: ' : 'Đoạn: '}{comment.anchor.quote}</Text>}
          <CommentThread comment={comment} onChanged={refresh} />
        </Stack>)}
      {!activeList.isError && totalPages > 1 && <Pagination total={totalPages} value={currentPage} onChange={setPage} />}
    </Stack>}
  </Stack>;
}
export function FeedbackPage({ novelId, box = 'sent' }: { novelId?: string; box?: 'sent' | 'received' }) {
  const account = useAuthStore(s => s.user?.userId); const [page, setPage] = useState(1); const client = useQueryClient();
  const query = useQuery({ queryKey: ['private-comments', account, 'feedback', novelId, box, page], queryFn: () => list('/author-feedback', { novelId, box, page, limit: 10 }), enabled: Boolean(account), ...policy });
  return <Stack><Title order={2}>{box === 'sent' ? 'Góp ý đã gửi' : 'Góp ý riêng'}</Title>{query.isPending && <LoadingState />}{query.isError && <ErrorState title="Không tải được góp ý" error={query.error} onRetry={() => void query.refetch()} />}{!query.isError && query.data?.items.map(comment => <CommentThread key={`${account}:${comment.commentId}`} comment={comment} onChanged={() => client.invalidateQueries()} />)}{query.data?.items.length === 0 && <Text c="dimmed">Chưa có góp ý.</Text>}{query.data && query.data.pages > 1 && <Pagination total={query.data.pages} value={page} onChange={setPage} />}</Stack>;
}
