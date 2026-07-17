import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  PasswordInput,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from '@mantine/core';
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
import { login, register } from '../../features/auth/auth-api';
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
import { useUiStore, type AuthorActivity } from '../../shared/stores/useUiStore';

const activities: Array<{
  value: AuthorActivity;
  label: string;
  icon: typeof IconBook2;
}> = [
  { value: 'story', label: 'Story', icon: IconBook2 },
  { value: 'entities', label: 'Entities', icon: IconUsers },
  { value: 'timeline', label: 'Timeline', icon: IconTimeline },
  { value: 'graph', label: 'Knowledge Graph', icon: IconSitemap },
  { value: 'search', label: 'Search', icon: IconSearch },
  { value: 'tasks', label: 'Tasks', icon: IconListCheck },
  { value: 'projects', label: 'Projects', icon: IconGitBranch },
  { value: 'settings', label: 'Settings', icon: IconSettings }
];

export function AuthorIdeShell() {
  const queryClient = useQueryClient();
  const activeActivity = useUiStore((state) => state.activeAuthorActivity);
  const setActiveActivity = useUiStore((state) => state.setActiveAuthorActivity);
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [novelId, setNovelId] = useState(localStorage.getItem('ephurin_author_novel_id') ?? '');
  const [chapterId, setChapterId] = useState(localStorage.getItem('ephurin_author_chapter_id') ?? '');
  const [editorContent, setEditorContent] = useState('');
  const [statusMessage, setStatusMessage] = useState('API ready');

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
    if (novelId) {
      localStorage.setItem('ephurin_author_novel_id', novelId);
    }
  }, [novelId]);

  useEffect(() => {
    if (chapterId) {
      localStorage.setItem('ephurin_author_chapter_id', chapterId);
    }
  }, [chapterId]);

  useEffect(() => {
    if (chapterQuery.data?.draft?.content) {
      setEditorContent(chapterQuery.data.draft.content);
    }
  }, [chapterQuery.data?.draft?.content]);

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      updateChapter(chapterId, {
        title: chapterQuery.data?.title,
        content: editorContent,
        autosave: false
      }),
    onSuccess: async (chapter) => {
      setStatusMessage(`Draft saved · version ${chapter.draftVersion ?? 'latest'}`);
      await queryClient.invalidateQueries({ queryKey: ['chapter', chapterId] });
      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
    }
  });

  const createNovelMutation = useMutation({
    mutationFn: () =>
      createNovel({
        title: 'Untitled Novel',
        synopsis: 'A starter synopsis for a new author project.',
        genre: 'Fantasy',
        tags: []
      }),
    onSuccess: async (novel) => {
      setNovelId(novel.novelId);
      setStatusMessage(`Created novel ${novel.title}`);
      await queryClient.invalidateQueries({ queryKey: ['novel', novel.novelId] });
    }
  });

  const createChapterMutation = useMutation({
    mutationFn: () =>
      createChapter(novelId, {
        title: 'Untitled Chapter',
        content: 'Start writing your chapter draft here.',
        isVip: false,
        priceCoins: 0
      }),
    onSuccess: async (chapter) => {
      setChapterId(chapter.chapterId);
      setEditorContent('Start writing your chapter draft here.');
      setStatusMessage(`Created chapter ${chapter.chapterNumber}`);
      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
    }
  });

  const submitChapterMutation = useMutation({
    mutationFn: () => submitChapterPublish(chapterId),
    onSuccess: async (result) => {
      setStatusMessage(`Chapter status: ${result.status}`);
      await queryClient.invalidateQueries({ queryKey: ['chapter', chapterId] });
      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
    }
  });

  const submitNovelMutation = useMutation({
    mutationFn: () => submitNovelPublish(novelId),
    onSuccess: async (result) => {
      setStatusMessage(`Novel status: ${result.status}`);
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
    }
  });

  const currentNovel = novelQuery.data ?? null;
  const currentChapter = chapterQuery.data ?? null;
  const chapters = chaptersQuery.data ?? [];

  const wordCount = useMemo(
    () => editorContent.trim().split(/\s+/).filter(Boolean).length,
    [editorContent]
  );

  if (!accessToken) {
    return <AuthLanding />;
  }

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
        canSave={Boolean(chapterId && editorContent)}
        canSubmitChapter={Boolean(chapterId)}
        canSubmitNovel={Boolean(novelId)}
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
          onNovelIdChange={setNovelId}
          onChapterIdChange={setChapterId}
          onCreateNovel={() => createNovelMutation.mutate()}
          onCreateChapter={() => createChapterMutation.mutate()}
          canCreateChapter={Boolean(novelId)}
        />
        <EditorWorkspace
          chapter={currentChapter}
          content={editorContent}
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

function AuthLanding() {
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('StrongPassword123!');
  const [error, setError] = useState<string | null>(null);

  const authMutation = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? login({ identifier: email, password })
        : register({ email, username, password }),
    onSuccess: (session) => {
      setError(null);
      setSession(session);
    },
    onError: (caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : 'Authentication failed');
    }
  });

  return (
    <Box className="auth-shell">
      <Paper p="xl" withBorder className="auth-card">
        <Group gap="sm" mb="lg">
          <IconBrain size={22} />
          <Title order={3}>Ephurin Author IDE</Title>
        </Group>

        <Stack>
          <TextInput
            label={mode === 'login' ? 'Email or username' : 'Email'}
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          {mode === 'register' ? (
            <TextInput
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
          ) : null}
          <PasswordInput
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          {error ? <Alert color="red">{error}</Alert> : null}
          <Button loading={authMutation.isPending} onClick={() => authMutation.mutate()}>
            {mode === 'login' ? 'Login' : 'Register'}
          </Button>
          <Button
            variant="subtle"
            onClick={() => setMode((currentMode) => (currentMode === 'login' ? 'register' : 'login'))}
          >
            Switch to {mode === 'login' ? 'register' : 'login'}
          </Button>
        </Stack>
      </Paper>
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
  canSave,
  canSubmitChapter,
  canSubmitNovel
}: {
  novel: Novel | null;
  chapter: Chapter | null;
  userLabel: string;
  onLogout: () => void;
  onSave: () => void;
  onSubmitChapter: () => void;
  onSubmitNovel: () => void;
  canSave: boolean;
  canSubmitChapter: boolean;
  canSubmitNovel: boolean;
}) {
  return (
    <Group className="top-toolbar" justify="space-between">
      <Group gap="sm">
        <IconBrain size={18} />
        <Text fw={700}>Ephurin IDE</Text>
        <Badge variant="light">{novel?.title ?? 'No project selected'}</Badge>
        <Badge color="gray" variant="outline">{chapter?.status ?? novel?.status ?? 'Idle'}</Badge>
      </Group>

      <Group gap="xs">
        <Button variant="subtle" size="xs" disabled={!canSave} onClick={onSave}>Save</Button>
        <Button variant="subtle" size="xs" disabled={!canSubmitNovel} onClick={onSubmitNovel}>
          Submit Novel
        </Button>
        <Button size="xs" disabled={!canSubmitChapter} onClick={onSubmitChapter}>Submit Chapter</Button>
        <Button variant="subtle" size="xs" onClick={onLogout}>{userLabel}</Button>
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
  canCreateChapter
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
  canCreateChapter
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
}) {
  return (
    <Stack gap="sm" mt="md">
      <TextInput
        label="Novel ID"
        size="xs"
        value={novelId}
        onChange={(event) => onNovelIdChange(event.currentTarget.value)}
        placeholder="Paste novel UUID"
      />
      <TextInput
        label="Chapter ID"
        size="xs"
        value={chapterId}
        onChange={(event) => onChapterIdChange(event.currentTarget.value)}
        placeholder="Paste chapter UUID"
      />

      <Group grow>
        <Button size="compact-xs" variant="light" onClick={onCreateNovel}>New Novel</Button>
        <Button size="compact-xs" variant="light" disabled={!canCreateChapter} onClick={onCreateChapter}>
          New Chapter
        </Button>
      </Group>

      <Paper p="sm" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">Project</Text>
        <Text fw={700}>{novel?.title ?? 'No novel loaded'}</Text>
        <Text size="sm" c="dimmed">{novel?.status ?? 'Paste a novel ID or create one'}</Text>
      </Paper>

      <Stack gap={4}>
        <Text size="sm" fw={600}>Chapters</Text>
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
          <Text size="sm" c="dimmed">No chapters loaded.</Text>
        )}
      </Stack>

      <Paper p="sm" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">Scene Context</Text>
        <Text size="sm">Characters, timeline, and summaries stay mocked until Phase 7.</Text>
      </Paper>
    </Stack>
  );
}

function PlaceholderActivity({ activity }: { activity: AuthorActivity }) {
  return (
    <Stack mt="md">
      <Text size="sm" c="dimmed">
        {activity} panel placeholder.
      </Text>
      <TextInput placeholder="Search or filter..." size="xs" />
    </Stack>
  );
}

function EditorWorkspace({
  chapter,
  content,
  onContentChange,
  loading
}: {
  chapter: Chapter | null;
  content: string;
  onContentChange: (value: string) => void;
  loading: boolean;
}) {
  return (
    <Box className="editor-workspace">
      <Group justify="space-between" mb="md">
        <Box>
          <Title order={3}>
            {chapter ? `Ch. ${chapter.chapterNumber} — ${chapter.title}` : 'No chapter selected'}
          </Title>
          <Text size="sm" c="dimmed">
            {loading ? 'Loading chapter...' : chapter?.draft ? `Draft v${chapter.draft.version}` : 'Select or create a chapter'}
          </Text>
        </Box>
        <Badge color={chapter?.status === 'PENDING_MODERATION' ? 'yellow' : 'violet'} variant="light">
          {chapter?.status ?? 'Idle'}
        </Badge>
      </Group>

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
        <Badge variant="light">Phase 7</Badge>
      </Group>

      <Stack gap="sm" mt="md">
        <Group gap={6}>
          <Badge size="sm">Characters</Badge>
          <Badge size="sm">Timeline</Badge>
          <Badge size="sm">Plot Summary</Badge>
        </Group>

        <Textarea
          label="Instruction"
          placeholder="Continue with quiet tension..."
          autosize
          minRows={3}
          disabled
        />

        <Group grow>
          <Button variant="light" disabled>Generate</Button>
          <Button variant="light" disabled leftSection={<IconAdjustments size={14} />}>
            Analyze
          </Button>
        </Group>

        <Paper p="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">Design Note</Text>
          <Text size="sm" mt={4}>
            AI Copilot remains an architectural placeholder until the Phase 7 architecture freeze.
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
      <Text size="xs">Words {wordCount} · Chapter {chapter?.chapterNumber ?? '-'}</Text>
      <Text size="xs">{statusMessage} · API {apiConnected ? 'connected' : 'error'}</Text>
    </Group>
  );
}
