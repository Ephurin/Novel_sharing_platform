import { NovelEngagement } from './NovelEngagement';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import {
  addToLibrary,
  createComment,
  deleteComment,
  followAuthor,
  getHistoryForNovel,
  getReadingPreferences,
  getReaderChapter,
  getReaderNovel,
  likeNovel,
  listComments,
  listHistory,
  listLibrary,
  removeFromLibrary,
  reportContent,
  saveReadingPreferences,
  searchPublishedNovels,
  syncHistory,
  unlikeNovel,
  unlockVipChapter,
  unfollowAuthor,
  updateComment,
  type ReadingPreferences,
  type ReaderChapter,
  type ReaderComment,
  type ReaderNovel
} from './reader-api';

export function ReaderPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ONGOING' | 'COMPLETED' | 'HIATUS' | ''>('');
  const [sortFilter, setSortFilter] = useState<'updatedAt' | 'views' | 'likes' | 'relevance'>('updatedAt');
  const [orderFilter, setOrderFilter] = useState<'desc' | 'asc'>('desc');
  const novelsQuery = useQuery({
    queryKey: ['reader-search', searchQuery, genreFilter, tagFilter, statusFilter, sortFilter, orderFilter],
    queryFn: () =>
      searchPublishedNovels({
        q: searchQuery,
        genre: genreFilter,
        tag: tagFilter,
        status: statusFilter,
        sort: sortFilter,
        order: orderFilter
      })
  });

  return (
    <Box>
      <ReaderHeader
        title="Reader Home"
        description="Browse published novels, then open detail or continue reading."
      />

      <Paper p="md" withBorder mb="md">
        <TextInput
          label="Search published novels"
          placeholder="Title, synopsis, genre..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
        />
        <SimpleGrid cols={{ base: 1, md: 4 }} mt="md">
          <TextInput
            label="Genre"
            placeholder="fantasy, romance..."
            value={genreFilter}
            onChange={(event) => setGenreFilter(event.currentTarget.value)}
          />
          <TextInput label="Tag" placeholder="slow-burn..." value={tagFilter} onChange={(event) => setTagFilter(event.currentTarget.value)} />
          <Select
            label="Story status"
            data={[
              { value: '', label: 'Any' },
              { value: 'ONGOING', label: 'Ongoing' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'HIATUS', label: 'Hiatus' }
            ]}
            value={statusFilter}
            onChange={(value) => setStatusFilter((value ?? '') as typeof statusFilter)}
          />
          <Group grow align="flex-end">
            <Select
              label="Sort"
              data={[
                { value: 'updatedAt', label: 'Updated' },
                { value: 'views', label: 'Views' },
                { value: 'likes', label: 'Likes' },
                { value: 'relevance', label: 'Relevance' }
              ]}
              value={sortFilter}
              onChange={(value) => setSortFilter((value ?? 'updatedAt') as typeof sortFilter)}
            />
            <Select
              label="Order"
              data={[
                { value: 'desc', label: 'Desc' },
                { value: 'asc', label: 'Asc' }
              ]}
              value={orderFilter}
              onChange={(value) => setOrderFilter((value ?? 'desc') as typeof orderFilter)}
            />
          </Group>
        </SimpleGrid>
      </Paper>

      {novelsQuery.isLoading ? <LoadingState label="Loading published novels..." /> : null}
      {novelsQuery.isError ? <ErrorState error={novelsQuery.error} onRetry={() => void novelsQuery.refetch()} /> : null}
      {!novelsQuery.isLoading && !novelsQuery.isError && !novelsQuery.data?.length ? (
        <EmptyState description="No published novels match the current search." />
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        {(novelsQuery.data ?? []).map((novel) => (
          <NovelCard key={novel.novelId} novel={novel} />
        ))}
      </SimpleGrid>
    </Box>
  );
}

export function PublicReaderPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const novelsQuery = useQuery({
    queryKey: ['public-reader-search', searchQuery, genreFilter, tagFilter],
    queryFn: () =>
      searchPublishedNovels({
        q: searchQuery,
        genre: genreFilter,
        tag: tagFilter,
        sort: 'updatedAt',
        order: 'desc'
      })
  });

  return (
    <Box className="web-content">
      <ReaderHeader
        title="Ephurin Public Library"
        description="Browse published stories as a guest. Login when you want to save, comment, unlock VIP, or report."
        actions={
          <Group>
            <Button component={Link} to="/login" variant="light">
              Login
            </Button>
            <Button component={Link} to="/reader" variant="subtle">
              My Reader Home
            </Button>
          </Group>
        }
      />

      <Paper p="md" withBorder mb="md">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <TextInput
            label="Search"
            placeholder="Title, synopsis..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
          <TextInput label="Genre" value={genreFilter} onChange={(event) => setGenreFilter(event.currentTarget.value)} />
          <TextInput label="Tag" value={tagFilter} onChange={(event) => setTagFilter(event.currentTarget.value)} />
        </SimpleGrid>
      </Paper>

      {novelsQuery.isLoading ? <LoadingState label="Loading public novels..." /> : null}
      {novelsQuery.isError ? <ErrorState error={novelsQuery.error} onRetry={() => void novelsQuery.refetch()} /> : null}
      {!novelsQuery.isLoading && !novelsQuery.isError && !novelsQuery.data?.length ? (
        <EmptyState description="No published novels match the current public search." />
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        {(novelsQuery.data ?? []).map((novel) => (
          <NovelCard key={novel.novelId} novel={novel} publicMode />
        ))}
      </SimpleGrid>
    </Box>
  );
}

export function ReaderNovelDetailPage() {
  const { novelId = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const novelQuery = useQuery({
    queryKey: ['reader-novel', novelId],
    queryFn: () => getReaderNovel(novelId),
    enabled: Boolean(novelId)
  });
  const continueQuery = useQuery({
    queryKey: ['reader-history-novel', novelId],
    queryFn: () => getHistoryForNovel(novelId),
    enabled: Boolean(novelId),
    retry: false
  });
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const addLibraryMutation = useMutation({
    mutationFn: () => addToLibrary(novelId),
    onSuccess: async () => {
      setInteractionNotice('Novel added to your library.');
      await queryClient.invalidateQueries({ queryKey: ['reader-library'] });
    },
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'This novel is already in your library.'))
  });
  const likeMutation = useMutation({
    mutationFn: () => likeNovel(novelId),
    onSuccess: () => setInteractionNotice('Liked this novel.'),
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'You already liked this novel.'))
  });
  const unlikeMutation = useMutation({
    mutationFn: () => unlikeNovel(novelId),
    onSuccess: () => setInteractionNotice('Removed your like.'),
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'No existing like to remove.'))
  });
  const followMutation = useMutation({
    mutationFn: () => followAuthor(novelQuery.data?.authorId ?? ''),
    onSuccess: () => setInteractionNotice('Following this author.'),
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'You already follow this author.'))
  });
  const unfollowMutation = useMutation({
    mutationFn: () => unfollowAuthor(novelQuery.data?.authorId ?? ''),
    onSuccess: () => setInteractionNotice('Unfollowed this author.'),
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'No existing follow to remove.'))
  });
  const reportMutation = useMutation({ mutationFn: () => reportContent({ targetType: 'NOVEL', targetId: novelId, reason: 'Reader report' }) });

  if (novelQuery.isLoading) return <LoadingState label="Loading novel detail..." />;
  if (novelQuery.isError) return <ErrorState error={novelQuery.error} onRetry={() => void novelQuery.refetch()} />;

  const novel = novelQuery.data;
  const chapters = novel?.chapters ?? [];
  const continueChapterId = continueQuery.data?.chapterId ?? chapters[0]?.chapterId;

  return (
    <Box>
      <ReaderHeader
        title={novel?.title ?? 'Novel Detail'}
        description={novel?.authorName ? `By ${novel.authorName}` : 'Published novel detail'}
        actions={
          <Button component={Link} to="/reader" variant="light">
            Back to Reader
          </Button>
        }
      />

      <SimpleGrid cols={{ base: 1, lg: 2 }} mb="md">
        <Paper p="md" withBorder>
          <Stack>
            <Group gap="xs">
              <Badge>{novel?.genre ?? 'No genre'}</Badge>
              <Badge variant="outline">{novel?.status ?? novel?.serialStatus ?? 'Published'}</Badge>
              <Badge variant="outline">{novel?.chaptersCount ?? chapters.length} chapters</Badge>
            </Group>
            {novel && <NovelEngagement novelId={novelId} authorId={novel.authorId} />}
            <Text c="dimmed">{novel?.synopsis ?? 'No synopsis.'}</Text>
            {interactionNotice ? <Alert color="blue">{interactionNotice}</Alert> : null}
            <Group>
              <Button loading={addLibraryMutation.isPending} onClick={() => addLibraryMutation.mutate()}>
                Add library
              </Button>
              <Button variant="light" loading={likeMutation.isPending} onClick={() => likeMutation.mutate()}>
                Like
              </Button>
              <Button variant="light" loading={unlikeMutation.isPending} onClick={() => unlikeMutation.mutate()}>
                Unlike
              </Button>
              <Button variant="light" loading={followMutation.isPending} disabled={!novel?.authorId} onClick={() => followMutation.mutate()}>
                Follow
              </Button>
              <Button component={Link} to={`/authors/${novel?.authorId ?? ''}`} variant="light" disabled={!novel?.authorId}>
                Author profile
              </Button>
              <Button variant="light" loading={unfollowMutation.isPending} disabled={!novel?.authorId} onClick={() => unfollowMutation.mutate()}>
                Unfollow
              </Button>
              <Button color="red" variant="light" loading={reportMutation.isPending} onClick={() => reportMutation.mutate()}>
                Report
              </Button>
            </Group>
            {continueChapterId ? (
              <Button onClick={() => navigate(`/reader/chapters/${continueChapterId}`)}>
                {continueQuery.data ? `Continue Ch. ${continueQuery.data.chapter.chapterNumber}` : 'Start reading'}
              </Button>
            ) : null}
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Title order={4}>Stats</Title>
          <Group mt="sm">
            <Badge variant="light">{novel?.viewsCount ?? 0} views</Badge>
            <Badge variant="light">{novel?.likesCount ?? 0} likes</Badge>
            {(novel?.tags ?? []).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </Group>
        </Paper>
      </SimpleGrid>

      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Published Chapters</Title>
          {chapters.length ? (
            <Button size="xs" onClick={() => navigate(`/reader/chapters/${chapters[0].chapterId}`)}>
              Read first
            </Button>
          ) : null}
        </Group>
        {!chapters.length ? <EmptyState description="No published chapters yet." /> : null}
        <Stack gap="xs">
          {chapters.map((chapter) => (
            <ChapterRow key={chapter.chapterId} chapter={chapter} />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

export function PublicReaderNovelDetailPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const novelQuery = useQuery({
    queryKey: ['public-reader-novel', novelId],
    queryFn: () => getReaderNovel(novelId),
    enabled: Boolean(novelId)
  });

  if (novelQuery.isLoading) return <LoadingState label="Loading public novel detail..." />;
  if (novelQuery.isError) return <ErrorState error={novelQuery.error} onRetry={() => void novelQuery.refetch()} />;

  const novel = novelQuery.data;
  const chapters = novel?.chapters ?? [];

  return (
    <Box className="web-content">
      <ReaderHeader
        title={novel?.title ?? 'Novel Detail'}
        description={novel?.authorName ? `By ${novel.authorName}` : 'Public published novel detail'}
        actions={
          <Group>
            <Button component={Link} to="/public" variant="light">
              Public library
            </Button>
            <Button component={Link} to="/login">
              Login for library/comment/report
            </Button>
          </Group>
        }
      />

      <SimpleGrid cols={{ base: 1, lg: 2 }} mb="md">
        <Paper p="md" withBorder>
          <Stack>
            <Group gap="xs">
              <Badge>{novel?.genre ?? 'No genre'}</Badge>
              <Badge variant="outline">{novel?.status ?? novel?.serialStatus ?? 'Published'}</Badge>
              <Badge variant="outline">{novel?.chaptersCount ?? chapters.length} chapters</Badge>
            </Group>
            <Text c="dimmed">{novel?.synopsis ?? 'No synopsis.'}</Text>
            <LoginPromptActions />
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Title order={4}>Public Stats</Title>
          <Group mt="sm">
            <Badge variant="light">{novel?.viewsCount ?? 0} views</Badge>
            <Badge variant="light">{novel?.likesCount ?? 0} likes</Badge>
            {(novel?.tags ?? []).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </Group>
        </Paper>
      </SimpleGrid>

      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Published Chapters</Title>
          {chapters.length ? (
            <Button size="xs" onClick={() => navigate(`/public/chapters/${chapters[0].chapterId}`)}>
              Read first free chapter
            </Button>
          ) : null}
        </Group>
        {!chapters.length ? <EmptyState description="No published chapters yet." /> : null}
        <Stack gap="xs">
          {chapters.map((chapter) => (
            <ChapterRow key={chapter.chapterId} chapter={chapter} publicMode />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

export function ReaderChapterPage() {
  const { chapterId = '' } = useParams();
  const queryClient = useQueryClient();
  const [commentContent, setCommentContent] = useState('');
  const preferencesQuery = useQuery({ queryKey: ['reading-preferences'], queryFn: getReadingPreferences });
  const chapterQuery = useQuery({
    queryKey: ['reader-chapter', chapterId],
    queryFn: () => getReaderChapter(chapterId),
    enabled: Boolean(chapterId),
    retry: false
  });
  const chapterNovelQuery = useQuery({
    queryKey: ['reader-novel', chapterQuery.data?.novelId],
    queryFn: () => getReaderNovel(chapterQuery.data?.novelId ?? ''),
    enabled: Boolean(chapterQuery.data?.novelId)
  });
  const commentsQuery = useQuery({
    queryKey: ['reader-comments', chapterId],
    queryFn: () => listComments(chapterId),
    enabled: Boolean(chapterId)
  });
  const syncHistoryMutation = useMutation({
    mutationFn: (input: { novelId: string; chapterId: string }) => syncHistory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reader-history'] })
  });
  const unlockMutation = useMutation({
    mutationFn: () => unlockVipChapter(chapterId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reader-chapter', chapterId] });
    }
  });
  const reportMutation = useMutation({
    mutationFn: () => reportContent({ targetType: 'CHAPTER', targetId: chapterId, reason: 'Reader report' })
  });
  const commentMutation = useMutation({
    mutationFn: () => createComment(chapterId, commentContent),
    onSuccess: async () => {
      setCommentContent('');
      await queryClient.invalidateQueries({ queryKey: ['reader-comments', chapterId] });
    }
  });
  const deleteCommentMutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reader-comments', chapterId] })
  });
  const preferencesMutation = useMutation({
    mutationFn: saveReadingPreferences,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reading-preferences'] });
    }
  });

  const isLockedVip = chapterQuery.error instanceof ApiClientError && chapterQuery.error.code === 'PAYMENT_002';
  const chapter = chapterQuery.data;

  useEffect(() => {
    if (chapter?.novelId) {
      syncHistoryMutation.mutate({ novelId: chapter.novelId, chapterId });
    }
  }, [chapter?.novelId, chapterId]);

  if (chapterQuery.isLoading) return <LoadingState label="Loading chapter..." />;

  if (isLockedVip) {
    return (
      <Box>
        <ReaderHeader title="VIP Chapter Locked" description="Unlock this chapter with mock coins to continue reading." />
        <Alert color="yellow" mb="md">
          {getApiErrorMessage(chapterQuery.error)}
        </Alert>
        <Group>
          <Button loading={unlockMutation.isPending} onClick={() => unlockMutation.mutate()}>
            Unlock chapter
          </Button>
          <Button component={Link} to="/wallet" variant="light">
            Go to Wallet
          </Button>
        </Group>
      </Box>
    );
  }

  if (chapterQuery.isError) return <ErrorState error={chapterQuery.error} onRetry={() => void chapterQuery.refetch()} />;

  const chapterList = chapterNovelQuery.data?.chapters ?? [];
  const currentChapterIndex = chapterList.findIndex((item) => item.chapterId === chapterId);
  const previousChapter = currentChapterIndex > 0 ? chapterList[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 ? chapterList[currentChapterIndex + 1] : null;
  const preferences = preferencesQuery.data;
  const readerStyle = buildReaderStyle(preferences);

  return (
    <Box>
      <ReaderHeader
        title={chapter ? `Ch. ${chapter.chapterNumber}: ${chapter.title}` : 'Chapter'}
        description={chapter?.isVip ? `VIP chapter · ${chapter.priceCoins} coins` : 'Free published chapter'}
        actions={
          <Group gap="xs">
            <Button component={Link} to={`/reader/novels/${chapter?.novelId ?? ''}`} variant="light" disabled={!chapter?.novelId}>
              Novel detail
            </Button>
            <Button
              component={Link}
              to={`/reader/chapters/${previousChapter?.chapterId ?? ''}`}
              variant="light"
              disabled={!previousChapter}
            >
              Previous
            </Button>
            <Button component={Link} to={`/reader/chapters/${nextChapter?.chapterId ?? ''}`} variant="light" disabled={!nextChapter}>
              Next
            </Button>
            <Button
              loading={syncHistoryMutation.isPending}
              disabled={!chapter}
              onClick={() => chapter?.novelId && syncHistoryMutation.mutate({ novelId: chapter.novelId, chapterId })}
            >
              Sync history
            </Button>
            <Button color="red" variant="light" loading={reportMutation.isPending} onClick={() => reportMutation.mutate()}>
              Report
            </Button>
          </Group>
        }
      />

      <Paper p="xl" withBorder mb="md">
        <Group justify="space-between" mb="md" align="flex-start">
          <Box>
            <Title order={4}>Reading Preferences</Title>
            <Text size="sm" c="dimmed">
              Saved to `reading_preferences` and applied immediately to the chapter body.
            </Text>
          </Box>
          <Badge variant="light">{preferencesQuery.isLoading ? 'Loading' : 'Synced'}</Badge>
        </Group>
        {preferences ? <ReadingPreferencesPanel preferences={preferences} onSave={(next) => preferencesMutation.mutate(next)} saving={preferencesMutation.isPending} /> : null}
      </Paper>

      <Paper p="xl" withBorder mb="md" style={readerStyle}>
        <Text className="chapter-prose" style={{ whiteSpace: 'pre-wrap', fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit' }}>
          {chapter?.content ?? 'No content.'}
        </Text>
      </Paper>

      <Paper p="md" withBorder>
        <Title order={4} mb="sm">
          Comments
        </Title>
        <Textarea
          label="Add comment"
          value={commentContent}
          onChange={(event) => setCommentContent(event.currentTarget.value)}
          minRows={3}
          mb="sm"
        />
        <Button loading={commentMutation.isPending} disabled={!commentContent.trim()} onClick={() => commentMutation.mutate()} mb="md">
          Submit comment
        </Button>

        {commentsQuery.isLoading ? <LoadingState label="Loading comments..." /> : null}
        {commentsQuery.isError ? <ErrorState error={commentsQuery.error} onRetry={() => void commentsQuery.refetch()} /> : null}
        {!commentsQuery.isLoading && !commentsQuery.isError && !commentsQuery.data?.length ? (
          <EmptyState description="No approved comments yet." />
        ) : null}
        <Stack gap="xs">
          {(commentsQuery.data ?? []).map((comment) => (
            <CommentCard
              key={comment.commentId}
              comment={comment}
              chapterId={chapterId}
              deleting={deleteCommentMutation.isPending}
              onDelete={() => deleteCommentMutation.mutate(comment.commentId)}
            />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

export function PublicReaderChapterPage() {
  const { chapterId = '' } = useParams();
  const chapterQuery = useQuery({
    queryKey: ['public-reader-chapter', chapterId],
    queryFn: () => getReaderChapter(chapterId),
    enabled: Boolean(chapterId),
    retry: false
  });
  const commentsQuery = useQuery({
    queryKey: ['public-reader-comments', chapterId],
    queryFn: () => listComments(chapterId),
    enabled: Boolean(chapterId)
  });
  const isLockedVip = chapterQuery.error instanceof ApiClientError && chapterQuery.error.code === 'PAYMENT_002';

  if (chapterQuery.isLoading) return <LoadingState label="Loading public chapter..." />;

  if (isLockedVip) {
    return (
      <Box className="web-content">
        <ReaderHeader title="VIP Chapter Locked" description="Guest users can preview public metadata, but VIP unlock requires login." />
        <Alert color="yellow" mb="md">
          {getApiErrorMessage(chapterQuery.error)}
        </Alert>
        <Group>
          <Button component={Link} to="/login">
            Login to unlock
          </Button>
          <Button component={Link} to="/public" variant="light">
            Public library
          </Button>
        </Group>
      </Box>
    );
  }

  if (chapterQuery.isError) return <ErrorState error={chapterQuery.error} onRetry={() => void chapterQuery.refetch()} />;

  const chapter = chapterQuery.data;

  return (
    <Box className="web-content">
      <ReaderHeader
        title={chapter ? `Ch. ${chapter.chapterNumber}: ${chapter.title}` : 'Chapter'}
        description="Guest free-chapter reading. Login to save progress, comment, report, or unlock VIP chapters."
        actions={
          <Group>
            <Button component={Link} to={`/public/novels/${chapter?.novelId ?? ''}`} variant="light" disabled={!chapter?.novelId}>
              Novel detail
            </Button>
            <Button component={Link} to="/login">
              Login
            </Button>
          </Group>
        }
      />

      <Paper p="xl" withBorder mb="md" style={buildReaderStyle()}>
        <Text className="chapter-prose" style={{ whiteSpace: 'pre-wrap', fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit' }}>
          {chapter?.content ?? 'No content.'}
        </Text>
      </Paper>

      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Public Comments</Title>
          <Button component={Link} to="/login" size="xs" variant="light">
            Login to comment/report
          </Button>
        </Group>
        {commentsQuery.isLoading ? <LoadingState label="Loading comments..." /> : null}
        {commentsQuery.isError ? <ErrorState error={commentsQuery.error} onRetry={() => void commentsQuery.refetch()} /> : null}
        {!commentsQuery.isLoading && !commentsQuery.isError && !commentsQuery.data?.length ? (
          <EmptyState description="No approved comments yet." />
        ) : null}
        <Stack gap="xs">
          {(commentsQuery.data ?? []).map((comment) => (
            <Paper key={comment.commentId} p="sm" withBorder>
              <Badge size="xs" variant="outline">
                {comment.status}
              </Badge>
              <Text mt={6}>{comment.content}</Text>
            </Paper>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}

function ReadingPreferencesPanel({
  preferences,
  onSave,
  saving
}: {
  preferences: ReadingPreferences;
  onSave: (preferences: ReadingPreferences) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  return (
    <SimpleGrid cols={{ base: 1, md: 5 }} mb="md">
      <Select
        label="Font family"
        data={[
          { value: 'system-ui', label: 'System' },
          { value: 'Georgia', label: 'Serif' },
          { value: 'Arial', label: 'Sans' }
        ]}
        value={draft.fontFamily ?? 'system-ui'}
        onChange={(value) => setDraft((current) => ({ ...current, fontFamily: value }))}
      />
      <NumberInput
        label="Font size"
        min={10}
        max={40}
        value={draft.fontSize}
        onChange={(value) => setDraft((current) => ({ ...current, fontSize: Number(value) || current.fontSize }))}
      />
      <Select
        label="Background"
        data={[
          { value: 'LIGHT', label: 'Light' },
          { value: 'DARK', label: 'Dark' },
          { value: 'SEPIA', label: 'Sepia' }
        ]}
        value={draft.background}
        onChange={(value) => setDraft((current) => ({ ...current, background: (value ?? 'DARK') as ReadingPreferences['background'] }))}
      />
      <NumberInput
        label="Line height"
        min={1}
        max={3}
        step={0.1}
        value={draft.lineHeight}
        onChange={(value) => setDraft((current) => ({ ...current, lineHeight: Number(value) || current.lineHeight }))}
      />
      <Button mt="xl" loading={saving} onClick={() => onSave(draft)}>
        Save preferences
      </Button>
    </SimpleGrid>
  );
}

function CommentCard({
  comment,
  chapterId,
  deleting,
  onDelete
}: {
  comment: ReaderComment;
  chapterId: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(comment.content);
  const updateMutation = useMutation({
    mutationFn: () => updateComment({ commentId: comment.commentId, content }),
    onSuccess: async () => {
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['reader-comments', chapterId] });
    }
  });
  const reportMutation = useMutation({
    mutationFn: () =>
      reportContent({
        targetType: 'COMMENT',
        targetId: comment.commentId,
        reason: 'Reader report',
        description: 'Reader reported this comment from the chapter comment list.'
      })
  });

  return (
    <Paper p="sm" withBorder>
      <Group justify="space-between" align="flex-start">
        <Box flex={1}>
          <Badge size="xs" variant="outline">
            {comment.status}
          </Badge>
          {isEditing ? (
            <Textarea mt="xs" value={content} onChange={(event) => setContent(event.currentTarget.value)} minRows={2} />
          ) : (
            <Text mt={6}>{comment.content}</Text>
          )}
        </Box>
        <Group gap="xs">
          {isEditing ? (
            <Button size="compact-xs" loading={updateMutation.isPending} disabled={!content.trim()} onClick={() => updateMutation.mutate()}>
              Save
            </Button>
          ) : (
            <Button size="compact-xs" variant="subtle" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
          <Button size="compact-xs" color="red" variant="subtle" loading={deleting} onClick={onDelete}>
            Delete
          </Button>
          <Button size="compact-xs" color="orange" variant="subtle" loading={reportMutation.isPending} onClick={() => reportMutation.mutate()}>
            Report
          </Button>
        </Group>
      </Group>
      {updateMutation.isError ? (
        <Alert color="red" mt="sm">
          {getApiErrorMessage(updateMutation.error)}
        </Alert>
      ) : null}
      {reportMutation.isSuccess ? (
        <Alert color="yellow" mt="sm">
          Comment report submitted.
        </Alert>
      ) : null}
      {reportMutation.isError ? (
        <Alert color="red" mt="sm">
          {getApiErrorMessage(reportMutation.error)}
        </Alert>
      ) : null}
    </Paper>
  );
}

function buildReaderStyle(preferences?: ReadingPreferences) {
  const background =
    preferences?.background === 'LIGHT'
      ? '#f8fafc'
      : preferences?.background === 'SEPIA'
        ? '#2f261c'
        : '#111827';
  const color = preferences?.background === 'LIGHT' ? '#111827' : preferences?.background === 'SEPIA' ? '#f5e6c8' : '#f8fafc';

  return {
    background,
    color,
    fontFamily: preferences?.fontFamily ?? 'system-ui',
    fontSize: preferences?.fontSize ?? 18,
    lineHeight: preferences?.lineHeight ?? 1.8
  };
}

function formatInteractionError(error: unknown, conflictMessage: string) {
  if (error instanceof ApiClientError && error.status === 409) {
    return conflictMessage;
  }

  return getApiErrorMessage(error);
}

export function ReaderLibraryPage() {
  const queryClient = useQueryClient();
  const libraryQuery = useQuery({ queryKey: ['reader-library'], queryFn: listLibrary });
  const removeMutation = useMutation({
    mutationFn: removeFromLibrary,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reader-library'] })
  });

  return (
    <Box>
      <ReaderHeader title="Library" description="Your saved novels." />
      {libraryQuery.isLoading ? <LoadingState label="Loading library..." /> : null}
      {libraryQuery.isError ? <ErrorState error={libraryQuery.error} onRetry={() => void libraryQuery.refetch()} /> : null}
      {!libraryQuery.isLoading && !libraryQuery.isError && !libraryQuery.data?.length ? <EmptyState description="Your library is empty." /> : null}
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        {(libraryQuery.data ?? []).map((novel) => (
          <NovelCard
            key={novel.novelId}
            novel={novel}
            extraAction={
              <Button size="xs" color="red" variant="light" loading={removeMutation.isPending} onClick={() => removeMutation.mutate(novel.novelId)}>
                Remove
              </Button>
            }
          />
        ))}
      </SimpleGrid>
    </Box>
  );
}

export function ReaderHistoryPage() {
  const historyQuery = useQuery({ queryKey: ['reader-history'], queryFn: listHistory });

  return (
    <Box>
      <ReaderHeader title="Reading History" description="Resume recent reading progress." />
      {historyQuery.isLoading ? <LoadingState label="Loading history..." /> : null}
      {historyQuery.isError ? <ErrorState error={historyQuery.error} onRetry={() => void historyQuery.refetch()} /> : null}
      {!historyQuery.isLoading && !historyQuery.isError && !historyQuery.data?.length ? <EmptyState description="No reading history yet." /> : null}
      <Stack>
        {(historyQuery.data ?? []).map((item) => (
          <Paper key={item.novelId} p="md" withBorder>
            <Group justify="space-between">
              <Box>
                <Title order={4}>{item.novel.title}</Title>
                <Text c="dimmed">
                  Ch. {item.chapter.chapterNumber}: {item.chapter.title}
                </Text>
              </Box>
              <Button component={Link} to={`/reader/chapters/${item.chapterId}`}>
                Continue
              </Button>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}

function ReaderHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <Group justify="space-between" mb="lg">
      <Box>
        <Title order={2}>{title}</Title>
        <Text c="dimmed">{description}</Text>
      </Box>
      {actions}
    </Group>
  );
}

function NovelCard({ novel, extraAction, publicMode = false }: { novel: ReaderNovel; extraAction?: ReactNode; publicMode?: boolean }) {
  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Title order={4}>{novel.title}</Title>
            <Text size="sm" c="dimmed">
              {novel.authorName ? `By ${novel.authorName}` : novel.genre ?? 'Published novel'}
            </Text>
          </Box>
          <Badge>{novel.status ?? novel.serialStatus ?? 'PUBLISHED'}</Badge>
        </Group>
        <Text size="sm" c="dimmed" lineClamp={3}>
          {novel.synopsis ?? 'No synopsis.'}
        </Text>
        <Group gap="xs">
          <Badge variant="outline">{novel.chaptersCount ?? 0} chapters</Badge>
          <Badge variant="outline">{novel.likesCount ?? 0} likes</Badge>
          <Badge variant="outline">{novel.viewsCount ?? 0} views</Badge>
        </Group>
        <Group>
          <Button component={Link} to={`${publicMode ? '/public' : '/reader'}/novels/${novel.novelId}`} size="xs">
            Open detail
          </Button>
          {extraAction}
        </Group>
      </Stack>
    </Paper>
  );
}

function ChapterRow({ chapter, publicMode = false }: { chapter: ReaderChapter; publicMode?: boolean }) {
  return (
    <Paper p="sm" withBorder>
      <Group justify="space-between">
        <Box>
          <Text fw={700}>
            Ch. {chapter.chapterNumber}: {chapter.title}
          </Text>
          <Text size="sm" c="dimmed">
            {chapter.wordCount ?? 0} words
          </Text>
        </Box>
        <Group gap="xs">
          {chapter.isVip ? <Badge color="yellow">VIP {chapter.priceCoins}</Badge> : <Badge color="green">Free</Badge>}
          <Button component={Link} to={`${publicMode ? '/public' : '/reader'}/chapters/${chapter.chapterId}`} size="xs">
            Read
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}

function LoginPromptActions() {
  return (
    <Alert color="blue">
      Library, like, follow, comment, report, history sync, and VIP unlock are protected actions. Login to use them.
    </Alert>
  );
}
