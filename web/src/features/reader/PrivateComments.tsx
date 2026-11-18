import { MultiSelect, Pagination, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useAuthStore } from '../auth/useAuthStore';
import { CommentComposer, emptyComment } from './CommentComposer';
import { CommentThread } from './CommentsSection';
import { connections } from './social-api';
import type { CommentInput, ReaderChapter, ReaderComment } from './reader-api';
import type { CommentTarget } from './comments-api';

export type PrivateComment = ReaderComment & { audience: string; anchor?: { quote: string; detached: boolean; currentParagraphId: string | null; paragraphId: string } | null };
const policy = { gcTime: 0, staleTime: 0, retry: false, refetchOnWindowFocus: 'always' as const, refetchInterval: 15000 };
async function list(url: string, params: Record<string, unknown>) {
  const response = await apiClient.get<ApiEnvelope<PrivateComment[]>>(url, { params });
  return { items: response.data.data, pages: Number(response.data.meta.totalPages) || 1, count: Number(response.data.meta.totalItems) };
}
export function PrivateComments(props: { target: CommentTarget; chapter?: ReaderChapter; paragraphIndex?: number }) {
  const account = useAuthStore(s => s.user?.userId);
  return account ? <PrivateCommentsSession key={`${account}:${props.target.kind}:${props.target.id}`} {...props} account={account} /> : null;
}
function PrivateCommentsSession({ target, chapter, paragraphIndex, account }: { target: CommentTarget; chapter?: ReaderChapter; paragraphIndex?: number; account: string }) {
  const [channel, setChannel] = useState('AUTHOR_PRIVATE'); const [page, setPage] = useState(1);
  const [paragraphId, setParagraphId] = useState<string | null>(null); const [recipients, setRecipients] = useState<string[]>([]); const [friendSearch, setFriendSearch] = useState('');
  const [recipientLabels, setRecipientLabels] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<CommentInput>(emptyComment); const client = useQueryClient(); const location = useLocation();
  const params = new URLSearchParams(location.search); const threadId = params.get('threadId'); const focusId = params.get('commentId') || threadId;
  useEffect(() => { if (paragraphIndex !== undefined) { setParagraphId(chapter?.paragraphs?.find(p => p.paragraphIndex === paragraphIndex)?.paragraphId ?? null); setChannel('FRIENDS_ALL'); } }, [paragraphIndex, chapter]);
  const url = `/${target.kind === 'chapter' ? 'chapters' : 'novels'}/${target.id}/comments`;
  const query = useQuery({ queryKey: ['private-comments', account, target.kind, target.id, channel, page], queryFn: () => list(url, { channel, page, limit: 10 }), ...policy });
  const friends = useQuery({ queryKey: ['connections', account, 'MUTUAL', 'private', friendSearch], queryFn: () => connections('MUTUAL', friendSearch), enabled: channel === 'FRIENDS_SELECTED' });
  const focused = useQuery({ queryKey: ['private-comments', account, 'focus', focusId], enabled: Boolean(threadId), queryFn: async () => {
    const response = await apiClient.get<ApiEnvelope<{ root: PrivateComment; replies: ReaderComment[]; focusCommentId: string }>>(`/comments/${focusId}/thread`, { params: { limit: 5 } });
    const root = response.data.data.root;
    if (root.commentId !== threadId || (target.kind === 'chapter' ? root.chapterId !== target.id : root.novelId !== target.id)) throw new Error('Liên kết không thuộc nội dung đang đọc.');
    return { ...response.data.data, page: Number(response.data.meta.page) || 1 };
  }, ...policy });
  useEffect(() => {
    if (focused.data?.root.audience) setChannel(focused.data.root.audience);
    if (focused.data?.root) setParagraphId(focused.data.root.anchor?.currentParagraphId ?? null);
  }, [focused.data?.root.commentId, focused.data?.root.audience, focused.data?.root.anchor?.currentParagraphId]);
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['private-comments'] }); await client.invalidateQueries({ queryKey: ['comment-replies'] }); };
  const create = useMutation({ mutationFn: async (value: CommentInput) => {
    if (useAuthStore.getState().user?.userId !== account) throw new Error('Phiên đăng nhập đã thay đổi.');
    await apiClient.post(url, { content: value.content, isSpoiler: value.isSpoiler, audience: channel,
      ...(channel === 'FRIENDS_SELECTED' ? { recipientUserIds: recipients } : {}),
      ...(paragraphId && chapter ? { anchor: { contentVersion: chapter.contentVersion, paragraphId } } : {}) });
  }, onSuccess: async () => { setDraft(emptyComment); await refresh(); } });
  return <Paper id="reader-private-comments" tabIndex={-1} withBorder p="md" mt="md"><Stack><Title order={3}>Trao đổi riêng</Title>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16 }}><Select label="Người nhận" value={channel} allowDeselect={false} data={[{ value: 'AUTHOR_PRIVATE', label: 'Chỉ tác giả' }, ...(chapter ? [{ value: 'FRIENDS_ALL', label: 'Tất cả bạn bè hiện tại' }, { value: 'FRIENDS_SELECTED', label: 'Chọn bạn bè' }] : [])]} onChange={v => { setChannel(v!); setPage(1); }} />
    {chapter && <Select label="Đoạn trao đổi" searchable clearable placeholder="Toàn chương (góp ý tác giả)" value={paragraphId} onChange={setParagraphId} data={(chapter.paragraphs ?? []).map(p => ({ value: p.paragraphId, label: `${p.paragraphIndex + 1}. ${p.text.slice(0, 90)}` }))} />}</div>
    {channel === 'FRIENDS_SELECTED' && <MultiSelect label="Bạn nhận bình luận" searchable searchValue={friendSearch} onSearchChange={setFriendSearch} value={recipients} onChange={ids => {
      setRecipients(ids); setRecipientLabels(previous => ({ ...previous, ...Object.fromEntries((friends.data?.items ?? []).map(p => [p.userId, `${p.displayName} (@${p.username})`])) }));
    }} data={[...(friends.data?.items ?? []).map(p => ({ value: p.userId, label: `${p.displayName} (@${p.username})` })), ...recipients.filter(id => !friends.data?.items.some(p => p.userId === id)).map(id => ({ value: id, label: recipientLabels[id] ?? 'Bạn đã chọn' }))]} />}
    {friends.isError && channel === 'FRIENDS_SELECTED' && <ErrorState title="Không tải được bạn bè" error={friends.error} onRetry={() => void friends.refetch()} />}
    {channel.startsWith('FRIENDS') && !paragraphId ? <Text size="sm">Chọn một đoạn để trao đổi với bạn bè.</Text> : <CommentComposer privateMode value={draft} onChange={setDraft} onSubmit={value => create.mutate(value)} label="Nội dung riêng" submitLabel="Gửi riêng" pending={create.isPending} />}
    {create.isSuccess && <Text role="status">Đã gửi. Nội dung có thể đang chờ kiểm duyệt.</Text>}{create.isError && <ErrorState title="Chưa gửi được" error={create.error} />}
    {threadId && focused.isPending && <LoadingState />}{focused.isError && <ErrorState title="Không còn quyền xem cuộc trao đổi này" error={focused.error} onRetry={() => void focused.refetch()} />}
    {!focused.isError && focused.data && <Stack gap="xs">{focused.data.root.anchor && <Text size="sm" c="dimmed">{focused.data.root.anchor.detached ? 'Đoạn gốc đã thay đổi: ' : 'Đoạn: '}{focused.data.root.anchor.quote}</Text>}<CommentThread comment={focused.data.root} onChanged={refresh} focus={{ commentId: focusId!, replyPage: focused.data.page, key: location.key }} /></Stack>}
    {query.isPending && <LoadingState />}{query.isError && <ErrorState title="Không tải được trao đổi riêng" error={query.error} onRetry={() => void query.refetch()} />}
    {!query.isError && query.data?.items.filter(comment => comment.commentId !== focused.data?.root.commentId).map(comment => <Stack key={comment.commentId} gap="xs">{comment.anchor && <Text size="sm" c="dimmed">{comment.anchor.detached ? 'Đoạn gốc đã thay đổi: ' : 'Đoạn: '}{comment.anchor.quote}</Text>}<CommentThread comment={comment} onChanged={refresh} /></Stack>)}
    {!focused.data && query.data?.items.length === 0 && <Text c="dimmed">Chưa có trao đổi trong phạm vi này.</Text>}{query.data && query.data.pages > 1 && <Pagination total={query.data.pages} value={page} onChange={setPage} />}
  </Stack></Paper>;
}
// Counts are derived only from the same authorized list API used by the thread panel.
export function ParagraphMarkers({ chapter, article }: { chapter: ReaderChapter; article: RefObject<HTMLElement | null> }) {
  const account = useAuthStore(s => s.user?.userId);
  const query = useQuery({ queryKey: ['private-comments', account, 'markers', chapter.chapterId, chapter.contentVersion], enabled: Boolean(account && chapter.contentVersion), ...policy,
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const channel of ['FRIENDS_ALL', 'FRIENDS_SELECTED', 'AUTHOR_PRIVATE']) {
        let page = 1, pages = 1;
        do {
          const result = await list(`/chapters/${chapter.chapterId}/comments`, { channel, page, limit: 100 }); pages = result.pages;
          for (const item of result.items) if (item.anchor?.currentParagraphId && !item.anchor.detached) counts[item.anchor.currentParagraphId] = (counts[item.anchor.currentParagraphId] ?? 0) + 1;
        } while (++page <= pages);
      }
      return counts;
    } });
  useEffect(() => {
    const blocks = Array.from(article.current?.querySelectorAll<HTMLElement>('[data-paragraph-id]') ?? []);
    for (const block of blocks) {
      const count = account && !query.isError ? query.data?.[block.dataset.paragraphId!] : 0;
      if (count) { block.dataset.privateCount = String(count); block.title = `${count} trao đổi riêng. Chọn đoạn để mở.`; }
      else { delete block.dataset.privateCount; block.removeAttribute('title'); }
    }
    return () => { for (const block of blocks) { delete block.dataset.privateCount; block.removeAttribute('title'); } };
  }, [account, query.data, query.isError, article, chapter]);
  return null;
}
export function FeedbackPage({ novelId, box = 'sent' }: { novelId?: string; box?: 'sent' | 'received' }) {
  const account = useAuthStore(s => s.user?.userId); const [page, setPage] = useState(1); const client = useQueryClient();
  const query = useQuery({ queryKey: ['private-comments', account, 'feedback', novelId, box, page], queryFn: () => list('/author-feedback', { novelId, box, page, limit: 10 }), enabled: Boolean(account), ...policy });
  return <Stack><Title order={2}>{box === 'sent' ? 'Góp ý đã gửi' : 'Góp ý riêng'}</Title>{query.isPending && <LoadingState />}{query.isError && <ErrorState title="Không tải được góp ý" error={query.error} onRetry={() => void query.refetch()} />}{!query.isError && query.data?.items.map(comment => <CommentThread key={`${account}:${comment.commentId}`} comment={comment} onChanged={() => client.invalidateQueries()} />)}{query.data?.items.length === 0 && <Text c="dimmed">Chưa có góp ý.</Text>}{query.data && query.data.pages > 1 && <Pagination total={query.data.pages} value={page} onChange={setPage} />}</Stack>;
}
