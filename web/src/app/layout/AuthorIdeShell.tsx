import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Badge, Box, Button, Group, Paper, ScrollArea, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import {
  IconAdjustments,
  IconBook2,
  IconBrain,
  IconGitBranch,
  IconListCheck,
  IconSearch,
  IconSettings,
  IconSitemap,
  IconTimeline,
  IconUsers
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/useAuthStore';
import {
  createChapter,
  createNovel,
  getChapter,
  getNovel,
  listMyNovels,
  listChapters,
  submitChapterPublish,
  submitNovelPublish,
  updateChapter,
  updateNovel
} from '../../features/novels/novel-api';
import type { Chapter, Novel } from '../../features/novels/novel-types';
import {
  listCharacterRelationships,
  listCharacters,
  listPlotSummaries,
  listTimelineEvents
} from '../../features/story-context/story-context-api';
import type {
  CharacterProfile,
  CharacterRelationship,
  PlotSummary,
  StoryTimelineEvent
} from '../../features/story-context/story-context-types';
import { AuthLanding } from '../../shared/components/AuthLanding';
import { useUiStore, type AuthorActivity } from '../../shared/stores/useUiStore';

const activities: Array<{ value: AuthorActivity; label: string; icon: typeof IconBook2 }> = [
  { value: 'story', label: 'Story', icon: IconBook2 },
  { value: 'entities', label: 'Entities', icon: IconUsers },
  { value: 'timeline', label: 'Timeline', icon: IconTimeline },
  { value: 'graph', label: 'Knowledge Graph', icon: IconSitemap },
  { value: 'search', label: 'Search', icon: IconSearch },
  { value: 'tasks', label: 'Tasks', icon: IconListCheck },
  { value: 'projects', label: 'Projects', icon: IconGitBranch },
  { value: 'settings', label: 'Settings', icon: IconSettings }
];

const starterContent = 'Start writing your chapter draft here.';

type AuthorContextOverview = {
  characters: CharacterProfile[];
  relationships: CharacterRelationship[];
  timelineEvents: StoryTimelineEvent[];
  plotSummaries: PlotSummary[];
  loading: boolean;
  error: boolean;
};

export function AuthorIdeShell() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const activeActivity = useUiStore((state) => state.activeAuthorActivity);
  const setActiveActivity = useUiStore((state) => state.setActiveAuthorActivity);
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const fallbackNovelId = localStorage.getItem('ephurin_author_novel_id') ?? '';
  const fallbackChapterId = localStorage.getItem('ephurin_author_chapter_id') ?? '';
  const novelId = searchParams.get('novelId') ?? fallbackNovelId;
  const chapterId = searchParams.get('chapterId') ?? fallbackChapterId;
  const [novelTitle, setNovelTitle] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [statusMessage, setStatusMessage] = useState('API ready');

  const updateIdeContext = (nextContext: { novelId?: string; chapterId?: string | null }) => {
    const nextNovelId = nextContext.novelId ?? novelId;
    const nextChapterId = nextContext.chapterId === undefined ? chapterId : nextContext.chapterId;
    const nextParams = new URLSearchParams(searchParams);

    if (nextNovelId) {
      nextParams.set('novelId', nextNovelId);
      localStorage.setItem('ephurin_author_novel_id', nextNovelId);
    } else {
      nextParams.delete('novelId');
      localStorage.removeItem('ephurin_author_novel_id');
    }

    if (nextChapterId) {
      nextParams.set('chapterId', nextChapterId);
      localStorage.setItem('ephurin_author_chapter_id', nextChapterId);
    } else {
      nextParams.delete('chapterId');
      localStorage.removeItem('ephurin_author_chapter_id');
    }

    setSearchParams(nextParams, { replace: true });
  };

  const novelsQuery = useQuery({
    queryKey: ['author-projects'],
    queryFn: () => listMyNovels(),
    enabled: Boolean(accessToken)
  });

  const novelQuery = useQuery({
    queryKey: ['novel', novelId],
    queryFn: () => getNovel(novelId),
    enabled: Boolean(novelId)
  });

  const chaptersQuery = useQuery({
    queryKey: ['chapters', novelId],
    queryFn: () => listChapters(novelId),
    enabled: Boolean(novelId)
  });

  const chapterQuery = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => getChapter(chapterId),
    enabled: Boolean(chapterId)
  });

  const charactersQuery = useQuery({
    queryKey: ['story-context', novelId, 'characters'],
    queryFn: () => listCharacters(novelId),
    enabled: Boolean(novelId && accessToken)
  });

  const relationshipsQuery = useQuery({
    queryKey: ['story-context', novelId, 'relationships'],
    queryFn: () => listCharacterRelationships(novelId),
    enabled: Boolean(novelId && accessToken)
  });

  const timelineQuery = useQuery({
    queryKey: ['story-context', novelId, 'timeline-events'],
    queryFn: () => listTimelineEvents(novelId),
    enabled: Boolean(novelId && accessToken)
  });

  const summariesQuery = useQuery({
    queryKey: ['story-context', novelId, 'plot-summaries'],
    queryFn: () => listPlotSummaries(novelId),
    enabled: Boolean(novelId && accessToken)
  });

  useEffect(() => {
    if (novelQuery.data) {
      setNovelTitle(novelQuery.data.title);
    }
  }, [novelQuery.data]);

  useEffect(() => {
    if (chapterQuery.data) {
      setChapterTitle(chapterQuery.data.draft?.title ?? chapterQuery.data.title);
      setEditorContent(chapterQuery.data.draft?.content ?? chapterQuery.data.content ?? '');
    }
  }, [chapterQuery.data]);

  const saveNovelTitleMutation = useMutation({
    mutationFn: () => updateNovel(novelId, { title: novelTitle.trim() }),
    onMutate: () => setStatusMessage('Saving novel title...'),
    onSuccess: async (novel) => {
      setNovelTitle(novel.title);
      setStatusMessage(`Novel renamed to ${novel.title}`);
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
    },
    onError: (error) => setStatusMessage(`Rename novel failed: ${getErrorMessage(error)}`)
  });

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      updateChapter(chapterId, {
        title: chapterTitle,
        content: editorContent,
        autosave: false
      }),
    onMutate: () => setStatusMessage('Saving draft...'),
    onSuccess: async (chapter) => {
      setStatusMessage(`Draft saved · version ${chapter.draftVersion ?? chapter.draft?.version ?? 'latest'}`);
      await queryClient.invalidateQueries({ queryKey: ['chapter', chapterId] });
      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
    },
    onError: (error) => setStatusMessage(`Save failed: ${getErrorMessage(error)}`)
  });

  const createNovelMutation = useMutation({
    mutationFn: async () => {
      const novel = await createNovel({
        title: 'Untitled Novel',
        synopsis: 'A starter synopsis for a new author project.',
        genre: 'Fantasy',
        tags: []
      });
      const chapter = await createChapter(novel.novelId, {
        title: 'Chapter 1',
        content: starterContent,
        isVip: false,
        priceCoins: 0
      });
      return { novel, chapter };
    },
    onMutate: () => setStatusMessage('Creating novel and first chapter...'),
    onSuccess: async ({ novel, chapter }) => {
      updateIdeContext({ novelId: novel.novelId, chapterId: chapter.chapterId });
      setEditorContent(chapter.draft?.content ?? starterContent);
      setStatusMessage(`Created ${novel.title} · chapter ${chapter.chapterNumber}`);
      await queryClient.invalidateQueries({ queryKey: ['novel', novel.novelId] });
      await queryClient.invalidateQueries({ queryKey: ['chapters', novel.novelId] });
      await queryClient.invalidateQueries({ queryKey: ['chapter', chapter.chapterId] });
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
    },
    onError: (error) => setStatusMessage(`Create novel failed: ${getErrorMessage(error)}`)
  });

  const createChapterMutation = useMutation({
    mutationFn: () =>
      createChapter(novelId, {
        title: 'Untitled Chapter',
        content: starterContent,
        isVip: false,
        priceCoins: 0
      }),
    onMutate: () => setStatusMessage('Creating chapter...'),
    onSuccess: async (chapter) => {
      updateIdeContext({ chapterId: chapter.chapterId });
      setEditorContent(chapter.draft?.content ?? starterContent);
      setStatusMessage(`Created chapter ${chapter.chapterNumber}`);
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['chapter', chapter.chapterId] });
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
    },
    onError: (error) => setStatusMessage(`Create chapter failed: ${getErrorMessage(error)}`)
  });

  const submitChapterMutation = useMutation({
    mutationFn: () => submitChapterPublish(chapterId),
    onMutate: () => setStatusMessage('Submitting chapter...'),
    onSuccess: async (result) => {
      setStatusMessage(`Chapter status: ${result.status}`);
      await queryClient.invalidateQueries({ queryKey: ['chapter', chapterId] });
      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
    },
    onError: (error) => setStatusMessage(`Submit chapter failed: ${getErrorMessage(error)}`)
  });

  const submitNovelMutation = useMutation({
    mutationFn: () => submitNovelPublish(novelId),
    onMutate: () => setStatusMessage('Submitting novel...'),
    onSuccess: async (result) => {
      setStatusMessage(`Novel status: ${result.status}`);
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
    },
    onError: (error) => setStatusMessage(`Submit novel failed: ${getErrorMessage(error)}`)
  });

  const currentNovel = novelQuery.data ?? null;
  const currentChapter = chapterQuery.data ?? null;
  const chapters = chaptersQuery.data ?? [];
  const contextOverview: AuthorContextOverview = {
    characters: charactersQuery.data ?? [],
    relationships: relationshipsQuery.data ?? [],
    timelineEvents: timelineQuery.data ?? [],
    plotSummaries: summariesQuery.data ?? [],
    loading: charactersQuery.isFetching || relationshipsQuery.isFetching || timelineQuery.isFetching || summariesQuery.isFetching,
    error: charactersQuery.isError || relationshipsQuery.isError || timelineQuery.isError || summariesQuery.isError
  };
  const wordCount = useMemo(() => editorContent.trim().split(/\s+/).filter(Boolean).length, [editorContent]);

  if (!accessToken) return <AuthLanding />;

  return (
    <Box className="ide-shell">
      <TopToolbar
        novel={currentNovel}
        chapter={currentChapter}
        userLabel={user?.username ?? 'Author'}
        onLogout={() => {
          clearSession();
          setStatusMessage('Logged out');
        }}
        onSave={() => saveDraftMutation.mutate()}
        onSubmitChapter={() => submitChapterMutation.mutate()}
        onSubmitNovel={() => submitNovelMutation.mutate()}
        onBackToProjects={() => navigate('/author')}
        canSave={Boolean(chapterId && editorContent)}
        canSubmitChapter={Boolean(chapterId)}
        canSubmitNovel={Boolean(novelId)}
        saving={saveDraftMutation.isPending}
        submittingChapter={submitChapterMutation.isPending}
        submittingNovel={submitNovelMutation.isPending}
      />

      <Box className="ide-body">
        <Stack className="activity-bar" gap="xs" align="center">
          {activities.map((activity) => {
            const Icon = activity.icon;
            return (
              <ActionIcon
                key={activity.value}
                aria-label={activity.label}
                color={activeActivity === activity.value ? 'violet' : 'gray'}
                variant={activeActivity === activity.value ? 'filled' : 'subtle'}
                onClick={() => setActiveActivity(activity.value)}
              >
                <Icon size={18} />
              </ActionIcon>
            );
          })}
        </Stack>

        <DynamicSidebar
          activeActivity={activeActivity}
          novel={currentNovel}
          novels={novelsQuery.data ?? []}
          chapters={chapters}
          novelId={novelId}
          chapterId={chapterId}
          novelTitle={novelTitle}
          contextOverview={contextOverview}
          onNovelTitleChange={setNovelTitle}
          onSaveNovelTitle={() => saveNovelTitleMutation.mutate()}
          onNovelSelect={(nextNovelId) => updateIdeContext({ novelId: nextNovelId, chapterId: null })}
          onChapterSelect={(nextChapterId) => updateIdeContext({ chapterId: nextChapterId })}
          onCreateNovel={() => createNovelMutation.mutate()}
          onCreateChapter={() => createChapterMutation.mutate()}
          canCreateChapter={Boolean(novelId)}
          creatingNovel={createNovelMutation.isPending}
          creatingChapter={createChapterMutation.isPending}
          savingNovelTitle={saveNovelTitleMutation.isPending}
        />

        <EditorWorkspace
          chapter={currentChapter}
          chapterTitle={chapterTitle}
          content={editorContent}
          onChapterTitleChange={setChapterTitle}
          onContentChange={setEditorContent}
          loading={chapterQuery.isFetching}
        />
        <AssistantPanel contextOverview={contextOverview} />
      </Box>

      <BottomStatusBar
        wordCount={wordCount}
        chapter={currentChapter}
        statusMessage={statusMessage}
        apiConnected={!novelQuery.isError && !chapterQuery.isError}
      />
    </Box>
  );
}

function TopToolbar({
  novel,
  chapter,
  userLabel,
  onLogout,
  onSave,
  onSubmitChapter,
  onSubmitNovel,
  onBackToProjects,
  canSave,
  canSubmitChapter,
  canSubmitNovel,
  saving,
  submittingChapter,
  submittingNovel
}: {
  novel: Novel | null;
  chapter: Chapter | null;
  userLabel: string;
  onLogout: () => void;
  onSave: () => void;
  onSubmitChapter: () => void;
  onSubmitNovel: () => void;
  onBackToProjects: () => void;
  canSave: boolean;
  canSubmitChapter: boolean;
  canSubmitNovel: boolean;
  saving: boolean;
  submittingChapter: boolean;
  submittingNovel: boolean;
}) {
  return (
    <Group className="top-toolbar" justify="space-between">
      <Group gap="sm">
        <IconBrain size={18} />
        <Text fw={700}>Ephurin IDE</Text>
        <Badge variant="light">{novel?.title ?? 'No project selected'}</Badge>
        <Badge color="gray" variant="outline">
          {chapter?.status ?? novel?.status ?? 'Idle'}
        </Badge>
      </Group>

      <Group gap="xs">
        <Button variant="light" size="xs" onClick={onBackToProjects}>
          Projects
        </Button>
        <Button variant="subtle" size="xs" loading={saving} disabled={!canSave} onClick={onSave}>
          Save
        </Button>
        <Button variant="subtle" size="xs" loading={submittingNovel} disabled={!canSubmitNovel} onClick={onSubmitNovel}>
          Submit Novel
        </Button>
        <Button size="xs" loading={submittingChapter} disabled={!canSubmitChapter} onClick={onSubmitChapter}>
          Submit Chapter
        </Button>
        <Button variant="subtle" size="xs" onClick={onLogout}>
          {userLabel}
        </Button>
      </Group>
    </Group>
  );
}

function DynamicSidebar({
  activeActivity,
  novel,
  novels,
  chapters,
  novelId,
  chapterId,
  novelTitle,
  contextOverview,
  onNovelTitleChange,
  onSaveNovelTitle,
  onNovelSelect,
  onChapterSelect,
  onCreateNovel,
  onCreateChapter,
  canCreateChapter,
  creatingNovel,
  creatingChapter,
  savingNovelTitle
}: {
  activeActivity: AuthorActivity;
  novel: Novel | null;
  novels: Novel[];
  chapters: Chapter[];
  novelId: string;
  chapterId: string;
  novelTitle: string;
  contextOverview: AuthorContextOverview;
  onNovelTitleChange: (value: string) => void;
  onSaveNovelTitle: () => void;
  onNovelSelect: (value: string) => void;
  onChapterSelect: (value: string) => void;
  onCreateNovel: () => void;
  onCreateChapter: () => void;
  canCreateChapter: boolean;
  creatingNovel: boolean;
  creatingChapter: boolean;
  savingNovelTitle: boolean;
}) {
  return (
    <Paper className="dynamic-sidebar" radius={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {activeActivity.replace('-', ' ')}
      </Text>

      <ScrollArea className="sidebar-scroll">
        {activeActivity === 'story' ? (
          <StoryTree
            novel={novel}
            novels={novels}
            chapters={chapters}
            novelId={novelId}
            chapterId={chapterId}
            novelTitle={novelTitle}
            contextOverview={contextOverview}
            onNovelTitleChange={onNovelTitleChange}
            onSaveNovelTitle={onSaveNovelTitle}
            onNovelSelect={onNovelSelect}
            onChapterSelect={onChapterSelect}
            onCreateNovel={onCreateNovel}
            onCreateChapter={onCreateChapter}
            canCreateChapter={canCreateChapter}
            creatingNovel={creatingNovel}
            creatingChapter={creatingChapter}
            savingNovelTitle={savingNovelTitle}
          />
        ) : (
          <PlaceholderActivity activity={activeActivity} novelId={novelId} contextOverview={contextOverview} />
        )}
      </ScrollArea>
    </Paper>
  );
}

function StoryTree({
  novel,
  novels,
  chapters,
  novelId,
  chapterId,
  novelTitle,
  contextOverview,
  onNovelTitleChange,
  onSaveNovelTitle,
  onNovelSelect,
  onChapterSelect,
  onCreateNovel,
  onCreateChapter,
  canCreateChapter,
  creatingNovel,
  creatingChapter,
  savingNovelTitle
}: {
  novel: Novel | null;
  novels: Novel[];
  chapters: Chapter[];
  novelId: string;
  chapterId: string;
  novelTitle: string;
  contextOverview: AuthorContextOverview;
  onNovelTitleChange: (value: string) => void;
  onSaveNovelTitle: () => void;
  onNovelSelect: (value: string) => void;
  onChapterSelect: (value: string) => void;
  onCreateNovel: () => void;
  onCreateChapter: () => void;
  canCreateChapter: boolean;
  creatingNovel: boolean;
  creatingChapter: boolean;
  savingNovelTitle: boolean;
}) {
  return (
    <Stack gap="sm" mt="md">
      <Group grow>
        <Button size="compact-xs" variant="light" loading={creatingNovel} onClick={onCreateNovel}>
          New Novel + Ch.1
        </Button>
        <Button size="compact-xs" variant="light" loading={creatingChapter} disabled={!canCreateChapter} onClick={onCreateChapter}>
          New Chapter
        </Button>
      </Group>

      <Paper p="sm" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">
          Current Project
        </Text>
        <TextInput
          label="Novel title"
          size="xs"
          value={novelTitle}
          onChange={(event) => onNovelTitleChange(event.currentTarget.value)}
          disabled={!novel}
          mt="xs"
        />
        <Button
          size="compact-xs"
          variant="light"
          fullWidth
          mt="xs"
          loading={savingNovelTitle}
          disabled={!novel || !novelTitle.trim() || novelTitle.trim() === novel.title}
          onClick={onSaveNovelTitle}
        >
          Save Novel Title
        </Button>
        <Group gap={6} mt="xs">
          <Badge size="xs" variant="light">
            {novel?.status ?? 'No project selected'}
          </Badge>
          {novel ? (
            <Badge size="xs" variant="outline">
              {novel.chaptersCount} chapters
            </Badge>
          ) : null}
        </Group>
      </Paper>

      <Stack gap={4}>
        <Text size="sm" fw={600}>
          Projects
        </Text>
        {novels.length ? (
          novels.map((project) => (
            <Button
              key={project.novelId}
              size="compact-xs"
              variant={novelId === project.novelId ? 'light' : 'subtle'}
              justify="space-between"
              onClick={() => onNovelSelect(project.novelId)}
            >
              {project.title} · {project.status}
            </Button>
          ))
        ) : (
          <Text size="sm" c="dimmed">
            Create a project to start writing.
          </Text>
        )}
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={600}>
          Chapters
        </Text>
        {chapters.length ? (
          chapters.map((chapter) => (
            <Button
              key={chapter.chapterId}
              size="compact-xs"
              variant={chapterId === chapter.chapterId ? 'light' : 'subtle'}
              justify="space-between"
              onClick={() => onChapterSelect(chapter.chapterId)}
            >
              Ch.{chapter.chapterNumber} {chapter.draft?.title ?? chapter.title} · {chapter.status}
            </Button>
          ))
        ) : (
          <Text size="sm" c="dimmed">
            No chapters loaded.
          </Text>
        )}
      </Stack>

      <Paper p="sm" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">
          Scene Context
        </Text>
        <Group gap={6} mt={6}>
          <Badge size="xs" variant="light">
            {contextOverview.characters.length} characters
          </Badge>
          <Badge size="xs" variant="light">
            {contextOverview.timelineEvents.length} events
          </Badge>
          <Badge size="xs" variant="light">
            {contextOverview.plotSummaries.length} summaries
          </Badge>
        </Group>
        {contextOverview.error ? (
          <Text size="xs" c="red" mt={6}>
            Context API failed. Restart backend if routes were just added.
          </Text>
        ) : (
          <Text size="sm" mt={6} c="dimmed">
            {contextOverview.loading
              ? 'Loading authoring context...'
              : contextOverview.characters
                  .slice(0, 3)
                  .map((character) => character.name)
                  .join(', ') || 'No context data for this project yet.'}
          </Text>
        )}
        {novelId ? (
          <Button component={Link} to={`/author/context/${novelId}`} size="compact-xs" variant="light" fullWidth mt="xs">
            Manage Context
          </Button>
        ) : null}
      </Paper>
    </Stack>
  );
}

function PlaceholderActivity({
  activity,
  novelId,
  contextOverview
}: {
  activity: AuthorActivity;
  novelId: string;
  contextOverview: AuthorContextOverview;
}) {
  const placeholderMap: Record<AuthorActivity, { title: string; description: string; tables: string[] }> = {
    story: {
      title: 'Story',
      description: 'Story activity is implemented through the chapter tree.',
      tables: ['novels', 'chapters', 'draft_chapters']
    },
    entities: {
      title: 'Entities',
      description: 'Future workspace for official character profiles and relationships. Persistence is deferred until context APIs are implemented.',
      tables: ['character_profiles', 'character_relationships']
    },
    timeline: {
      title: 'Timeline',
      description: 'Future ordered plot event view for the current novel. Useful later as Copilot context.',
      tables: ['story_timeline_events']
    },
    graph: {
      title: 'Knowledge Graph',
      description: 'Future visual graph combining characters, relationships, timeline events, and plot summaries.',
      tables: ['character_profiles', 'character_relationships', 'story_timeline_events', 'plot_summaries']
    },
    search: {
      title: 'Search',
      description: 'Future project-local search across chapters and authoring context.',
      tables: ['chapters', 'draft_chapters', 'plot_summaries']
    },
    tasks: {
      title: 'Tasks',
      description: 'Future writing task/checklist panel. No persistence table is finalized for this in MVP.',
      tables: ['MVP placeholder']
    },
    projects: {
      title: 'Projects',
      description: 'Use the Project Manager for full project switching and metadata editing.',
      tables: ['novels', 'chapters']
    },
    settings: {
      title: 'Settings',
      description: 'Future author workspace settings. AI settings remain deferred until Phase 10.',
      tables: ['user_profiles', 'reading_preferences']
    }
  };
  const placeholder = placeholderMap[activity];

  if (activity === 'entities') {
    return (
      <Stack mt="md" gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Entities</Text>
          <Badge variant="light">{contextOverview.characters.length} characters</Badge>
        </Group>
        <Text size="sm" c="dimmed">
          Read-only character profiles from PostgreSQL. Create/update/delete comes next.
        </Text>
        {contextOverview.characters.length ? (
          contextOverview.characters.slice(0, 8).map((character) => (
            <Paper key={character.characterId} p="xs" withBorder>
              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  {character.name}
                </Text>
                <Badge size="xs" variant="outline">
                  {character.role}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" lineClamp={2}>
                {character.description ?? character.personality ?? 'No description yet.'}
              </Text>
            </Paper>
          ))
        ) : (
          <Text size="sm" c="dimmed">
            {novelId ? 'No character data found.' : 'Select a project first.'}
          </Text>
        )}
        <Badge size="sm" variant="outline">
          {contextOverview.relationships.length} relationships
        </Badge>
      </Stack>
    );
  }

  if (activity === 'timeline') {
    return (
      <Stack mt="md" gap="sm">
        <Group justify="space-between">
          <Text fw={700}>Timeline</Text>
          <Badge variant="light">{contextOverview.timelineEvents.length} events</Badge>
        </Group>
        <Text size="sm" c="dimmed">
          Ordered story events linked to chapters when available.
        </Text>
        {contextOverview.timelineEvents.length ? (
          contextOverview.timelineEvents.slice(0, 10).map((event) => (
            <Paper key={event.eventId} p="xs" withBorder>
              <Group gap={6}>
                <Badge size="xs">#{event.eventOrder}</Badge>
                {event.chapterNumber ? (
                  <Badge size="xs" variant="outline">
                    Ch.{event.chapterNumber}
                  </Badge>
                ) : null}
              </Group>
              <Text size="sm" fw={600} mt={4}>
                {event.title}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={2}>
                {event.summary}
              </Text>
            </Paper>
          ))
        ) : (
          <Text size="sm" c="dimmed">
            {novelId ? 'No timeline events found.' : 'Select a project first.'}
          </Text>
        )}
      </Stack>
    );
  }

  if (activity === 'graph') {
    return (
      <Stack mt="md" gap="sm">
        <Text fw={700}>Knowledge Graph</Text>
        <Text size="sm" c="dimmed">
          Graph rendering is not implemented yet, but the data source is now connected.
        </Text>
        <Group gap="xs">
          <Badge>{contextOverview.characters.length} nodes</Badge>
          <Badge>{contextOverview.relationships.length} edges</Badge>
          <Badge>{contextOverview.timelineEvents.length} events</Badge>
          <Badge>{contextOverview.plotSummaries.length} summaries</Badge>
        </Group>
      </Stack>
    );
  }

  if (activity === 'search') {
    return (
      <Stack mt="md" gap="sm">
        <Text fw={700}>Search</Text>
        <Text size="sm" c="dimmed">
          Project search UI is pending. Current context data is already available for filtering in the next frontend phase.
        </Text>
        <TextInput placeholder="Search characters, timeline, summaries..." size="xs" disabled />
      </Stack>
    );
  }

  return (
    <Stack mt="md">
      <Text fw={700}>{placeholder.title}</Text>
      <Text size="sm" c="dimmed">
        {placeholder.description}
      </Text>
      <Group gap="xs">
        {placeholder.tables.map((tableName) => (
          <Badge key={tableName} size="sm" variant="outline">
            {tableName}
          </Badge>
        ))}
      </Group>
      <TextInput placeholder="Search/filter placeholder..." size="xs" disabled />
    </Stack>
  );
}

function EditorWorkspace({
  chapter,
  chapterTitle,
  content,
  onChapterTitleChange,
  onContentChange,
  loading
}: {
  chapter: Chapter | null;
  chapterTitle: string;
  content: string;
  onChapterTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  loading: boolean;
}) {
  return (
    <Box className="editor-workspace">
      <Group justify="space-between" mb="md">
        <Box>
          <Title order={3}>{chapter ? `Ch. ${chapter.chapterNumber} — ${chapter.title}` : 'No chapter selected'}</Title>
          <Text size="sm" c="dimmed">
            {loading ? 'Loading chapter...' : chapter?.draft ? `Draft v${chapter.draft.version}` : 'Select or create a chapter'}
          </Text>
        </Box>
        <Badge color={chapter?.status === 'PENDING_MODERATION' ? 'yellow' : 'violet'} variant="light">
          {chapter?.status ?? 'Idle'}
        </Badge>
      </Group>

      <TextInput
        label="Chapter title"
        value={chapterTitle}
        onChange={(event) => onChapterTitleChange(event.currentTarget.value)}
        disabled={!chapter}
        mb="md"
      />

      <Textarea
        className="editor-textarea"
        value={content}
        onChange={(event) => onContentChange(event.currentTarget.value)}
        placeholder="Write your chapter draft here..."
        autosize
        minRows={22}
      />
    </Box>
  );
}

function AssistantPanel({ contextOverview }: { contextOverview: AuthorContextOverview }) {
  return (
    <Paper className="assistant-panel" radius={0}>
      <Group justify="space-between">
        <Text fw={700}>Writing Copilot</Text>
        <Badge variant="light">Phase 10</Badge>
      </Group>

      <Stack gap="sm" mt="md">
        <Group gap={6}>
          <Badge size="sm">{contextOverview.characters.length} Characters</Badge>
          <Badge size="sm">{contextOverview.timelineEvents.length} Timeline</Badge>
          <Badge size="sm">{contextOverview.plotSummaries.length} Plot Summary</Badge>
        </Group>

        <Textarea label="Instruction" placeholder="Continue with quiet tension..." autosize minRows={3} disabled />

        <Group grow>
          <Button variant="light" disabled>
            Generate
          </Button>
          <Button variant="light" disabled leftSection={<IconAdjustments size={14} />}>
            Analyze
          </Button>
        </Group>

        <Paper p="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">
            Design Note
          </Text>
          <Text size="sm" mt={4}>
            AI Copilot remains disabled until Phase 10. Context data is read from the backend and ready for later prompts.
          </Text>
        </Paper>
      </Stack>
    </Paper>
  );
}

function BottomStatusBar({
  wordCount,
  chapter,
  statusMessage,
  apiConnected
}: {
  wordCount: number;
  chapter: Chapter | null;
  statusMessage: string;
  apiConnected: boolean;
}) {
  return (
    <Group className="status-bar" justify="space-between">
      <Text size="xs">
        Words {wordCount} · Chapter {chapter?.chapterNumber ?? '-'}
      </Text>
      <Text size="xs">
        {statusMessage} · API {apiConnected ? 'connected' : 'error'}
      </Text>
    </Group>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}
