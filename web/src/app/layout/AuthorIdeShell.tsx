import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Paper,
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
  const activeActivity = useUiStore((state) => state.activeAuthorActivity);
  const setActiveActivity = useUiStore((state) => state.setActiveAuthorActivity);

  return (
    <Box className="ide-shell">
      <TopToolbar />

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

        <DynamicSidebar activeActivity={activeActivity} />
        <EditorWorkspace />
        <AssistantPanel />
      </Box>

      <BottomStatusBar />
    </Box>
  );
}

function TopToolbar() {
  return (
    <Group className="top-toolbar" justify="space-between">
      <Group gap="sm">
        <IconBrain size={18} />
        <Text fw={700}>Ephurin IDE</Text>
        <Badge variant="light">The Moon Archive</Badge>
        <Badge color="gray" variant="outline">Draft v3</Badge>
      </Group>

      <Group gap="xs">
        <Button variant="subtle" size="xs">Save</Button>
        <Button variant="subtle" size="xs">Preview</Button>
        <Button size="xs">Submit Publish</Button>
      </Group>
    </Group>
  );
}

function DynamicSidebar({ activeActivity }: { activeActivity: AuthorActivity }) {
  return (
    <Paper className="dynamic-sidebar" radius={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {activeActivity.replace('-', ' ')}
      </Text>

      <ScrollArea className="sidebar-scroll">
        {activeActivity === 'story' ? <StoryTree /> : <PlaceholderActivity activity={activeActivity} />}
      </ScrollArea>
    </Paper>
  );
}

function StoryTree() {
  return (
    <Stack gap="sm" mt="md">
      <Group justify="space-between">
        <Text fw={700}>The Moon Archive</Text>
        <Button size="compact-xs" variant="light">New</Button>
      </Group>

      <Stack gap={4}>
        <Text size="sm" fw={600}>▾ Arc I: The Missing Name</Text>
        <Text size="sm" c="dimmed">✓ Ch.01 The Door</Text>
        <Text size="sm" c="dimmed">✓ Ch.02 Broken Lantern</Text>
        <Text size="sm" c="yellow">! Ch.03 Pending Review</Text>
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={600}>▾ Arc II: The Moon Archive</Text>
        <Text size="sm" c="violet">● Ch.12 The Door That Forgot</Text>
        <Text size="sm" c="dimmed">○ Ch.13 Untitled</Text>
      </Stack>

      <Paper p="sm" withBorder>
        <Text size="xs" c="dimmed" tt="uppercase">Scene Context</Text>
        <Text size="sm">Characters: Liora, Cael</Text>
        <Text size="sm">Timeline: Event #42</Text>
        <Text size="sm">Summary: Arc II / Ch.11</Text>
      </Paper>

      <Paper p="sm" withBorder>
        <Text size="xs" c="yellow" fw={700}>Consistency</Text>
        <Text size="sm">Cael should not know the door's true name yet.</Text>
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

function EditorWorkspace() {
  return (
    <Box className="editor-workspace">
      <Group justify="space-between" mb="md">
        <Box>
          <Title order={3}>Ch. 12 — The Door That Forgot</Title>
          <Text size="sm" c="dimmed">Arc II · Autosaved 12 seconds ago</Text>
        </Box>
        <Badge color="yellow" variant="light">1 consistency warning</Badge>
      </Group>

      <Paper className="editor-surface" withBorder>
        <Text className="chapter-prose">
          The archive door opened without sound.
          {'\n\n'}
          Liora held her breath. The silver glyphs along the frame rearranged
          themselves into a name she almost knew.
          {'\n\n'}
          "It remembers me," she whispered, "but I don't."
        </Text>
      </Paper>
    </Box>
  );
}

function AssistantPanel() {
  return (
    <Paper className="assistant-panel" radius={0}>
      <Group justify="space-between">
        <Text fw={700}>Writing Copilot</Text>
        <Badge variant="light">AI idle</Badge>
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
        />

        <Group grow>
          <Button variant="light">Generate</Button>
          <Button variant="light" leftSection={<IconAdjustments size={14} />}>
            Analyze
          </Button>
        </Group>

        <Paper p="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">Suggestion</Text>
          <Text size="sm" mt={4}>
            Add a sensory beat before Cael speaks to preserve the reveal.
          </Text>
          <Group mt="sm" gap="xs">
            <Button size="compact-xs">Insert</Button>
            <Button size="compact-xs" variant="subtle">Create Proposal</Button>
          </Group>
        </Paper>

        <Paper p="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">Context Updates</Text>
          <Text size="sm">Plot Summary +1 pending proposal</Text>
        </Paper>
      </Stack>
    </Paper>
  );
}

function BottomStatusBar() {
  return (
    <Group className="status-bar" justify="space-between">
      <Text size="xs">Words 1,248 · Chapter 12/40 · Arc II</Text>
      <Text size="xs">Context Health 86% · 1 warning · API not connected</Text>
    </Group>
  );
}
