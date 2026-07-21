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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/useAuthStore';
import {
  createChapter,
  createNovel,
  getChapter,
  getNovel,
  listChapters,
  submitChapterPublish,
  submitNovelPublish,
  updateChapter
} from '../../features/novels/novel-api';
import type { Chapter, Novel } from '../../features/novels/novel-types';
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

  useEffect(() => {
    if (chapterQuery.data) {
      setChapterTitle(chapterQuery.data.draft?.title ?? chapterQuery.data.title);
      setEditorContent(chapterQuery.data.draft?.content ?? chapterQuery.data.content ?? '');
    }
  }, [chapterQuery.data]);

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
      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['chapter', chapter.chapterId] });
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
          chapters={chapters}
          novelId={novelId}
          chapterId={chapterId}
          onNovelIdChange={(nextNovelId) => updateIdeContext({ novelId: nextNovelId, chapterId: null })}
          onChapterIdChange={(nextChapterId) => updateIdeContext({ chapterId: nextChapterId })}
          onCreateNovel={() => createNovelMutation.mutate()}
          onCreateChapter={() => createChapterMutation.mutate()}
          canCreateChapter={Boolean(novelId)}
          creatingNovel={createNovelMutation.isPending}
          creatingChapter={createChapterMutation.isPending}
        />

        <EditorWorkspace
          chapter={currentChapter}
          chapterTitle={chapterTitle}
          content={editorContent}
          onChapterTitleChange={setChapterTitle}
          onContentChange={setEditorContent}
          loading={chapterQuery.isFetching}
        />
        <AssistantPanel />
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
  chapters,
  novelId,
  chapterId,
  onNovelIdChange,
  onChapterIdChange,
  onCreateNovel,
  onCreateChapter,
  canCreateChapter,
  creatingNovel,
  creatingChapter
}: {
  activeActivity: AuthorActivity;
  novel: Novel | null;
  chapters: Chapter[];
  novelId: string;
  chapterId: string;
  onNovelIdChange: (value: string) => void;
  onChapterIdChange: (value: string) => void;
  onCreateNovel: () => void;
  onCreateChapter: () => void;
  canCreateChapter: boolean;
  creatingNovel: boolean;
  creatingChapter: boolean;
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
            chapters={chapters}
            novelId={novelId}
            chapterId={chapterId}
            onNovelIdChange={onNovelIdChange}
            onChapterIdChange={onChapterIdChange}
            onCreateNovel={onCreateNovel}
            onCreateChapter={onCreateChapter}
            canCreateChapter={canCreateChapter}
            creatingNovel={creatingNovel}
            creatingChapter={creatingChapter}
          />
        ) : (
          <PlaceholderActivity activity={activeActivity} />
        )}
      </ScrollArea>
    </Paper>
  );
}

function StoryTree({
  novel,
  chapters,
  novelId,
  chapterId,
  onNovelIdChange,
  onChapterIdChange,
  onCreateNovel,
  onCreateChapter,
  canCreateChapter,
  creatingNovel,
  creatingChapter
}: {
  novel: Novel | null;
  chapters: Chapter[];
  novelId: string;
  chapterId: string;
  onNovelIdChange: (value: string) => void;
  onChapterIdChange: (value: string) => void;
  onCreateNovel: () => void;
  onCreateChapter: () => void;
  canCreateChapter: boolean;
  creatingNovel: boolean;
  creatingChapter: boolean;
}) {
  return (
    <Stack gap="sm" mt="md">
      <TextInput label="Novel ID" size="xs" value={novelId} onChange={(event) => onNovelIdChange(event.currentTarget.value)} />
      <TextInput label="Chapter ID" size="xs" value={chapterId} onChange={(event) => onChapterIdChange(event.currentTarget.value)} />

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
          Project
        </Text>
        <Text fw={700}>{novel?.title ?? 'No novel loaded'}</Text>
        <Text size="sm" c="dimmed">
          {novel?.status ?? 'Paste a novel ID or create one'}
        </Text>
      </Paper>

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
              onClick={() => onChapterIdChange(chapter.chapterId)}
            >
              Ch.{chapter.chapterNumber} {chapter.title} · {chapter.status}
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
        <Text size="sm">Characters, timeline, and summaries stay placeholders until AI/Copilot phase.</Text>
      </Paper>
    </Stack>
  );
}

function PlaceholderActivity({ activity }: { activity: AuthorActivity }) {
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

function AssistantPanel() {
  return (
    <Paper className="assistant-panel" radius={0}>
      <Group justify="space-between">
        <Text fw={700}>Writing Copilot</Text>
        <Badge variant="light">Phase 10</Badge>
      </Group>

      <Stack gap="sm" mt="md">
        <Group gap={6}>
          <Badge size="sm">Characters</Badge>
          <Badge size="sm">Timeline</Badge>
          <Badge size="sm">Plot Summary</Badge>
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
            AI Copilot remains disabled until Phase 10.
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
