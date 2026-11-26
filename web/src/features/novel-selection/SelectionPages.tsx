import { novelHref, navigationHref } from '../../shared/routes';
import { useState } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { AdminHeader, AdminPanel, dateTime } from '../admin/AdminShared';
import { getModeratorAccess } from '../moderator/moderator-api';
import {
  criteriaLabels, decisionLabels, decideSelection, getAuthorSelection, getSelectionChapter, getSelectionDetail,
  getSelectionQueue, nominateNovel, ownNominations, reconsiderationLabels, requestReconsideration, selectionLabels,
  supplementSelection, type Criteria, type Decision
} from './selection-api';

export function NominationForm({ novelId, own = false }: { novelId: string; own?: boolean }) {
  const client = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  const [requestKey, setRequestKey] = useState('');
  const title = own ? 'Ứng cử tác phẩm' : 'Đề cử truyện';
  const mutation = useMutation({
    mutationFn: () => nominateNovel(novelId, reason.trim(), requestKey),
    onSuccess: () => {
      setOpened(false);
      void client.invalidateQueries({ queryKey: ['author-selection', novelId] });
      void client.invalidateQueries({ queryKey: ['own-nominations'] });
    }
  });
  return <>
    {mutation.isSuccess ? <Text size="sm" role="status">Đã gửi. <Link to={navigationHref("/account/nominations")}>Xem đề cử của tôi</Link></Text> :
      <Button variant="default" size="compact-sm" onClick={() => {
        mutation.reset();
        setRequestKey(crypto.randomUUID());
        setOpened(true);
      }}>{title}</Button>}
    <AnimatedModal opened={opened} onClose={() => setOpened(false)} title={title} centered>
      <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <Stack>
          <Textarea label="Lý do" description="Từ 50 đến 2.000 ký tự." minRows={4} maxLength={2000}
            value={reason} onChange={(event) => {
              setReason(event.currentTarget.value);
              setRequestKey(crypto.randomUUID());
            }} required />
          {mutation.isError && <Alert color="red" role="alert">{getApiErrorMessage(mutation.error)}</Alert>}
          <Group justify="space-between">
            <Link to={navigationHref("/account/nominations")}>Đề cử của tôi</Link>
            <Button type="submit" disabled={reason.trim().length < 50} loading={mutation.isPending}>Gửi</Button>
          </Group>
        </Stack>
      </form>
    </AnimatedModal>
  </>;
}

export function AuthorSelection({ novelId, maySelfNominate }: { novelId: string; maySelfNominate: boolean }) {
  const client = useQueryClient();
  const [notes, setNotes] = useState('');
  const query = useQuery({ queryKey: ['author-selection', novelId], queryFn: () => getAuthorSelection(novelId) });
  const item = query.data?.item;
  const window = query.data?.reconsiderationWindow;
  const [reconsiderationOpen, setReconsiderationOpen] = useState(false);
  const [reconsiderationReason, setReconsiderationReason] = useState('');
  const reconsider = useMutation({
    mutationFn: (decision: NonNullable<typeof window>) => requestReconsideration(novelId, decision, reconsiderationReason.trim()),
    onSuccess: () => {
      setReconsiderationReason('');
      setReconsiderationOpen(false);
      void query.refetch();
    },
    onError: () => { void query.refetch(); }
  });
  const addNotes = useMutation({
    mutationFn: (target: NonNullable<typeof item>) => supplementSelection(target, notes.trim()),
    onSuccess: () => {
      setNotes('');
      void client.invalidateQueries({ queryKey: ['author-selection', novelId] });
    },
    onError: () => { void query.refetch(); }
  });
  return <Paper component="section" withBorder p="md" aria-label="Hồ sơ tuyển chọn" mt="md" mb="md">
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={2} size="h4">Tuyển chọn tác phẩm</Title>
        {item && <Badge variant="light">{selectionLabels[item.status]}</Badge>}
      </Group>
      {query.isPending && <LoadingState />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {item?.last_reason && <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{item.last_reason}</Text>}
      {window && !window.submitted && <Group justify="space-between">
        <Text size="sm" c="dimmed">{window.inWindow ? `Hạn gửi yêu cầu xét lại: ${dateTime(window.deadline)}` : 'Đã hết hạn gửi yêu cầu xét lại.'}</Text>
        {window.canSubmit && <Button variant="default" size="compact-sm" onClick={() => {
          reconsider.reset();
          setReconsiderationOpen(true);
        }}>Yêu cầu xét lại</Button>}
      </Group>}
      {query.data?.reconsiderations?.map((entry) => <Paper key={entry.reconsideration_id} withBorder p="sm">
        <Group justify="space-between"><Text fw={600} size="sm">Xét lại quyết định {selectionLabels[entry.decision_status].toLocaleLowerCase('vi')}</Text>
          <Badge variant="light">{reconsiderationLabels[entry.status]}</Badge></Group>
        <Text size="sm" c="dimmed">Đã gửi {dateTime(entry.created_at)}</Text>
        {entry.resolution && <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.resolution}</Text>}
      </Paper>)}
      {query.isSuccess && !item && !query.data.eligibility && <Text size="sm" c="dimmed">Tác phẩm chưa đủ điều kiện tuyển chọn.</Text>}
      {query.data?.eligibility && maySelfNominate && (!item || ['REJECTED', 'REVOKED'].includes(item.status)) &&
        <Group><NominationForm novelId={novelId} own /></Group>}
      {item?.status === 'NEEDS_INFO' && <form onSubmit={(event) => { event.preventDefault(); addNotes.mutate(item); }}>
        <Stack gap="sm">
          <Textarea label="Thông tin bổ sung" value={notes} onChange={(event) => setNotes(event.currentTarget.value)}
            minRows={3} maxLength={2000} required />
          {addNotes.isError && <Alert color="red" role="alert">{getApiErrorMessage(addNotes.error)}</Alert>}
          <Group justify="flex-end"><Button type="submit" disabled={!notes.trim()} loading={addNotes.isPending}>Gửi bổ sung</Button></Group>
        </Stack>
      </form>}
    </Stack>
    <AnimatedModal opened={reconsiderationOpen} onClose={() => !reconsider.isPending && setReconsiderationOpen(false)} title="Yêu cầu xét lại" centered>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (window?.canSubmit && reconsiderationReason.trim()) reconsider.mutate(window);
      }}>
        <Stack>
          {window && <Text size="sm" c="dimmed">Hạn gửi {dateTime(window.deadline)}</Text>}
          <Textarea label="Lý do xét lại" value={reconsiderationReason} required maxLength={2000} minRows={4}
            onChange={(event) => setReconsiderationReason(event.currentTarget.value)} />
          {reconsider.isError && <Alert color="red" role="alert">{getApiErrorMessage(reconsider.error)}</Alert>}
          <Group justify="flex-end"><Button type="submit" disabled={!window?.canSubmit || !reconsiderationReason.trim()}
            loading={reconsider.isPending}>Gửi yêu cầu xét lại</Button></Group>
        </Stack>
      </form>
    </AnimatedModal>
  </Paper>;
}

function Pager({ page, hasMore, setPage }: { page: number; hasMore: boolean; setPage: (page: number) => void }) {
  return (page > 1 || hasMore) && <Group justify="flex-end" mt="md">
    <Button variant="default" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</Button>
    <Button variant="default" disabled={!hasMore} onClick={() => setPage(page + 1)}>Trang sau</Button>
  </Group>;
}

export function MyNominationsPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['own-nominations', page], queryFn: () => ownNominations(page), retry: false });
  return <>
    <AdminHeader title="Đề cử của tôi" />
    {query.isPending && <LoadingState />}
    {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
    {query.isSuccess && <AdminPanel>
      {query.data.items.length === 0 && <EmptyState description="Bạn chưa có đề cử." />}
      <Stack>{query.data.items.map((item) => <Paper key={item.nomination_id} withBorder p="md">
        <Group justify="space-between"><Link to={novelHref({ novelId: item.novel_id, novelSlug: item.novel_slug }, '/public')}>{item.title}</Link>
          <Badge variant="light">{selectionLabels[item.status]}</Badge></Group>
        <Text size="sm" mt="xs" style={{ overflowWrap: 'anywhere' }}>{item.reason}</Text>
      </Paper>)}</Stack>
      <Pager page={page} hasMore={query.data.hasMore} setPage={setPage} />
    </AdminPanel>}
  </>;
}

export function ModeratorSelectionLink() {
  const access = useQuery({ queryKey: ['moderator-access'], queryFn: getModeratorAccess });
  return access.data?.permissions.includes('selection.review') &&
    <Button component={Link} to={navigationHref("/moderator/selections")} variant="default" size="sm">Tuyển chọn tác phẩm</Button>;
}

export function ModeratorSelectionsPage() {
  const access = useQuery({ queryKey: ['moderator-access'], queryFn: getModeratorAccess });
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'queue' | 'selected'>('queue');
  const query = useQuery({ queryKey: ['selection-queue', page, view], queryFn: () => getSelectionQueue(page, view), retry: false });
  return <>
    <AdminHeader title="Tuyển chọn tác phẩm">
      {access.data?.permissions.includes('placement.manage') &&
        <Button component={Link} to={navigationHref("/moderator/placements")} variant="default">Lịch giới thiệu</Button>}
    </AdminHeader>
    <AdminPanel>
      <Select label="Hồ sơ" value={view} data={[{ value: 'queue', label: 'Cần xử lý' }, { value: 'selected', label: 'Đã công nhận' }]}
        onChange={(value) => { setView(value === 'selected' ? 'selected' : 'queue'); setPage(1); }} maw={250} mb="md" />
      {query.isPending && <LoadingState />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isSuccess && <>
        {query.data.items.length === 0 && <EmptyState description="Nhóm này chưa có hồ sơ." />}
        <Stack gap="sm">{query.data.items.map((item) => <Paper key={item.case_id} withBorder p="md">
          <Group justify="space-between">
            <Link to={navigationHref(`/moderator/selections/${item.case_id}`)}>{item.title}</Link>
            <Badge variant="light">{item.needs_comparison ? 'Cần so phiên bản' : selectionLabels[item.status]}</Badge>
          </Group>
        </Paper>)}</Stack>
        <Pager page={page} hasMore={query.data.hasMore} setPage={setPage} />
      </>}
    </AdminPanel>
  </>;
}

const emptyCriteria: Criteria = { content: false, readability: false, consistency: false, completeness: false };
const criteriaKeys = ['content', 'readability', 'consistency', 'completeness'] as const;

export function ModeratorSelectionDetailPage() {
  const { caseId = '' } = useParams();
  return <ModeratorSelectionDetail key={caseId} caseId={caseId} />;
}

function ModeratorSelectionDetail({ caseId }: { caseId: string }) {
  const cache = useQueryClient();
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [criteria, setCriteria] = useState(emptyCriteria);
  const [shortStory, setShortStory] = useState(false);
  const query = useQuery({ queryKey: ['selection-detail', caseId], queryFn: () => getSelectionDetail(caseId), retry: false });
  const version = query.data?.version;
  const [reviewedVersion, setReviewedVersion] = useState(version);
  function resetConfirmations() {
    setDecision(null);
    setCriteria(emptyCriteria);
    setShortStory(false);
  }
  if (version !== reviewedVersion) {
    setReviewedVersion(version);
    resetConfirmations();
  }
  const selectedChapter = useQuery({
    queryKey: ['selection-chapter', caseId, chapterId, query.data?.version],
    queryFn: () => getSelectionChapter(caseId, chapterId ?? ''), enabled: !!chapterId, retry: false
  });
  const mutation = useMutation({
    mutationFn: (input: {
      item: NonNullable<typeof query.data>; action: Decision; reason: string; criteria: Criteria; shortStory: boolean;
    }) => decideSelection(input.item, input.action, input.reason, input.criteria, input.shortStory),
    onSuccess: async (_, { item }) => {
      resetConfirmations();
      setReason('');
      await Promise.all([cache.invalidateQueries({ queryKey: ['selection-queue'] }), query.refetch(),
        cache.invalidateQueries({ queryKey: ['reader-novel', item.novel_id] }),
        cache.invalidateQueries({ queryKey: ['featured-selections'] }),
        cache.invalidateQueries({ queryKey: ['featured-placements'] })]);
    },
    onError: async (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        resetConfirmations();
        await query.refetch();
      }
    }
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const item = query.data;
  const chapters = new Map(item.baseline?.chapters.map((chapter) => [chapter.chapterId, chapter]));
  for (const chapter of item.current.chapters) chapters.set(chapter.chapterId, chapter);
  const activeAction = decision && item.allowedDecisions.includes(decision) ? decision : null;
  const approving = activeAction === 'APPROVE';
  const shortException = approving && item.eligibility === 'SHORT_STORY';
  const busy = query.isFetching || mutation.isPending;
  const canSubmit = !busy && activeAction && reason.trim() && (!approving ||
    (item.eligibility && Object.values(criteria).every(Boolean) && (!shortException || shortStory)));
  return <>
    <AdminHeader title={item.title}>
      <Button component={Link} to={navigationHref("/moderator/selections")} variant="default">Về hàng chờ</Button>
      <Badge variant="light">{selectionLabels[item.status]}</Badge>
    </AdminHeader>
    <Stack>
      <AdminPanel>
        <Stack gap="sm">
          <Title order={2} size="h4">Bản công khai</Title>
          <Text size="sm">{item.eligibility === 'STANDARD' ? 'Đủ số chương phát hành' : item.eligibility === 'SHORT_STORY'
            ? 'Truyện ngắn hoàn thành' : 'Chưa đủ điều kiện'}</Text>
          {item.baseline && (item.current.title !== item.baseline.title || item.current.synopsis !== item.baseline.synopsis) &&
            <><Text size="sm" c="dimmed">Bản đã xét · {item.baseline.title}</Text><Text style={{ whiteSpace: 'pre-wrap' }}>{item.baseline.synopsis}</Text></>}
          <Text style={{ whiteSpace: 'pre-wrap' }}>{item.current.synopsis}</Text>
          <Select label="Đọc hoặc đối chiếu chương" clearable value={chapterId} onChange={setChapterId}
            data={[...chapters.values()].map((chapter) => ({ value: chapter.chapterId, label: `${chapter.number}. ${chapter.title}` }))} />
          {chapterId && selectedChapter.isPending && <LoadingState />}
          {chapterId && selectedChapter.isError && <ErrorState error={selectedChapter.error} onRetry={() => void selectedChapter.refetch()} />}
          {chapterId && selectedChapter.data && <>
            {selectedChapter.data.baseline && <Paper withBorder p="md"><Title order={3} size="h5">Bản đã xét · {selectedChapter.data.baseline.title}</Title>
              <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selectedChapter.data.baseline.content}</Text></Paper>}
            <Paper withBorder p="md"><Title order={3} size="h5">Bản hiện tại</Title>
              <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selectedChapter.data.current?.content ?? 'Chương đã rời bản công khai.'}</Text></Paper>
          </>}
        </Stack>
      </AdminPanel>
      <AdminPanel>
        <Stack gap="sm">
          <Title order={2} size="h4">Lý do đề cử</Title>
          {item.nominations.map((nomination) => <Text key={nomination.nominator_id} size="sm" style={{ overflowWrap: 'anywhere' }}>{nomination.reason}</Text>)}
          {item.author_notes && <><Title order={3} size="h5">Thông tin tác giả bổ sung</Title><Text size="sm">{item.author_notes}</Text></>}
          {item.last_reason && <Text size="sm" c="dimmed">{item.last_reason}</Text>}
        </Stack>
      </AdminPanel>
      {item.allowedDecisions.length > 0 && <AdminPanel>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (activeAction && canSubmit) {
            mutation.mutate({ item, action: activeAction, reason: reason.trim(), criteria, shortStory });
          }
        }}>
          <Stack>
            <Select label="Quyết định" disabled={busy} value={activeAction} onChange={(value) =>
              setDecision(item.allowedDecisions.find((action) => action === value) ?? null)}
              data={item.allowedDecisions.map((action) => ({ value: action, label: decisionLabels[action] }))} />
            {approving && criteriaKeys.map((key) => <Checkbox key={key} label={criteriaLabels[key]}
              disabled={busy} checked={criteria[key]} onChange={(event) => setCriteria({ ...criteria, [key]: event.currentTarget.checked })} />)}
            {shortException && <Checkbox label="Xác nhận đây là truyện ngắn hoàn chỉnh" disabled={busy} checked={shortStory}
              onChange={(event) => setShortStory(event.currentTarget.checked)} />}
            <Textarea label="Lý do xử lý" required value={reason} minRows={3} maxLength={2000}
              onChange={(event) => setReason(event.currentTarget.value)} />
            {mutation.isError && <Alert color="red" role="alert">{getApiErrorMessage(mutation.error)}</Alert>}
            <Group justify="flex-end"><Button type="submit" disabled={!canSubmit} loading={busy}>Lưu quyết định</Button></Group>
          </Stack>
        </form>
      </AdminPanel>}
      {mutation.isSuccess && <Alert role="status">Đã lưu quyết định.</Alert>}
    </Stack>
  </>;
}
