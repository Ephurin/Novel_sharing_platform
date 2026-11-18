import { Badge, Box, Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { createChapter, createNovel, listChapters, listMyNovels } from '../novels/novel-api';
import type { Novel, NovelStatus } from '../novels/novel-types';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

const statusOptions = [
  { value: 'ALL', label: 'All projects' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_MODERATION', label: 'Pending moderation' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'REJECTED', label: 'Rejected' }
];

const starterContent = 'Start writing your chapter draft here.';

export function AuthorProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<NovelStatus | 'ALL'>('ALL');
  const projectsQuery = useQuery({
    queryKey: ['author-projects', searchQuery, status],
    queryFn: () => listMyNovels({ searchQuery, status })
  });

  const createProjectMutation = useMutation({
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
    onSuccess: async ({ novel, chapter }) => {
      localStorage.setItem('ephurin_author_novel_id', novel.novelId);
      localStorage.setItem('ephurin_author_chapter_id', chapter.chapterId);
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
      openIdeTab({ novelId: novel.novelId, chapterId: chapter.chapterId });
    }
  });

  const projects = projectsQuery.data ?? [];

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>Writing Projects</Title>
          <Text c="dimmed">Manage your novel projects before opening one in the Author IDE.</Text>
        </Box>
        <Group gap="xs">
          <Button onClick={() => navigate('/reader')} variant="light">
            Switch to Reader
          </Button>
          <Button loading={createProjectMutation.isPending} onClick={() => createProjectMutation.mutate()}>
            New Project
          </Button>
        </Group>
      </Group>

      <Paper p="md" withBorder mb="md">
        <Group align="end">
          <TextInput
            label="Search projects"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            className="grow"
          />
          <Select
            label="Status"
            value={status}
            data={statusOptions}
            onChange={(value) => setStatus((value ?? 'ALL') as NovelStatus | 'ALL')}
          />
        </Group>
      </Paper>

      {projectsQuery.isLoading ? <LoadingState label="Loading writing projects..." /> : null}
      {projectsQuery.isError ? <ErrorState error={projectsQuery.error} onRetry={() => void projectsQuery.refetch()} /> : null}
      {!projectsQuery.isLoading && !projectsQuery.isError && !projects.length ? (
        <EmptyState
          title="No writing projects yet"
          description="Create your first novel project, then open it in the Author IDE to start drafting chapters."
          action={
            <Button loading={createProjectMutation.isPending} onClick={() => createProjectMutation.mutate()}>
              Create first project
            </Button>
          }
        />
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        {projects.map((project) => (
          <ProjectCard key={project.novelId} project={project} />
        ))}
      </SimpleGrid>
    </Box>
  );
}

function ProjectCard({ project }: { project: Novel }) {
  const navigate = useNavigate();
  const chaptersQuery = useQuery({
    queryKey: ['author-project-health', project.novelId],
    queryFn: () => listChapters(project.novelId)
  });
  const chapters = chaptersQuery.data ?? [];
  const statusCounts = chapters.reduce<Record<string, number>>((counts, chapter) => {
    counts[chapter.status] = (counts[chapter.status] ?? 0) + 1;
    return counts;
  }, {});

  const openInIde = () => {
    localStorage.setItem('ephurin_author_novel_id', project.novelId);
    localStorage.removeItem('ephurin_author_chapter_id');
    openIdeTab({ novelId: project.novelId });
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Title order={4}>{project.title}</Title>
            <Text size="sm" c="dimmed" lineClamp={3}>
              {project.synopsis}
            </Text>
          </Box>
          <Badge color={getStatusColor(project.status)}>{project.status}</Badge>
        </Group>

        <Group gap="xs">
          <Badge variant="outline">{project.chaptersCount} chapters</Badge>
          <Badge variant="outline">{project.serialStatus}</Badge>
          <Badge variant="outline">{project.ageRating}</Badge>
        </Group>
        {chapters.length ? (
          <Group gap="xs">
            {Object.entries(statusCounts).map(([status, count]) => (
              <Badge key={status} size="sm" variant="light">
                {status}: {count}
              </Badge>
            ))}
          </Group>
        ) : null}

        <Group grow>
          <Button size="xs" onClick={openInIde}>
            Open in IDE
          </Button>
          <Button size="xs" variant="light" onClick={() => navigate(`/author/novels/${project.novelId}`)}>
            Metadata
          </Button>
          <Button size="xs" variant="light" color="indigo" onClick={() => navigate(`/author/context/${project.novelId}`)}>
            Cẩm nang
          </Button>
          <Button size="xs" variant="light" onClick={() => navigate(`/author/import/${project.novelId}`)}>
            Import
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function getStatusColor(status: NovelStatus) {
  if (status === 'PUBLISHED') return 'green';
  if (status === 'PENDING_MODERATION') return 'yellow';
  if (status === 'REJECTED') return 'red';
  return 'gray';
}

function openIdeTab(context: { novelId: string; chapterId?: string }) {
  const params = new URLSearchParams({ novelId: context.novelId });
  if (context.chapterId) params.set('chapterId', context.chapterId);
  window.open(`/author/ide?${params.toString()}`, '_blank', 'noopener,noreferrer');
}
