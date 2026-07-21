import { Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getNovel, listChapters, submitNovelPublish, updateNovel } from '../novels/novel-api';

export function AuthorNovelMetadataPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');

  useEffect(() => {
    if (novelQuery.data) {
      setTitle(novelQuery.data.title);
      setSynopsis(novelQuery.data.synopsis);
      setCoverImageUrl(novelQuery.data.coverImageUrl ?? '');
    }
  }, [novelQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => updateNovel(novelId, { title, synopsis, coverImageUrl: coverImageUrl || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
    }
  });

  const submitMutation = useMutation({
    mutationFn: () => submitNovelPublish(novelId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
    }
  });

  if (novelQuery.isLoading) return <LoadingState label="Loading novel metadata..." />;
  if (novelQuery.isError) return <ErrorState error={novelQuery.error} onRetry={() => void novelQuery.refetch()} />;

  const chapters = chaptersQuery.data ?? [];
  const statusCounts = chapters.reduce<Record<string, number>>((counts, chapter) => {
    counts[chapter.status] = (counts[chapter.status] ?? 0) + 1;
    return counts;
  }, {});

  const openIde = (chapterId?: string) => {
    const params = new URLSearchParams({ novelId });
    if (chapterId) params.set('chapterId', chapterId);
    window.open(`/author/ide?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>Novel Metadata</Title>
          <Text c="dimmed">Edit project metadata and open chapters directly in the Author IDE.</Text>
        </Box>
        <Group gap="xs">
          <Button component={Link} to="/author" variant="light">
            Projects
          </Button>
          <Button onClick={() => openIde()}>Open IDE</Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper p="md" withBorder>
          <Stack>
            <Group gap="xs">
              <Badge>{novelQuery.data?.status}</Badge>
              <Badge variant="outline">{novelQuery.data?.serialStatus}</Badge>
              <Badge variant="outline">{novelQuery.data?.ageRating}</Badge>
            </Group>
            <TextInput label="Title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
            <TextInput label="Cover image URL" value={coverImageUrl} onChange={(event) => setCoverImageUrl(event.currentTarget.value)} />
            <Textarea label="Synopsis" value={synopsis} onChange={(event) => setSynopsis(event.currentTarget.value)} minRows={8} />
            <Group>
              <Button loading={saveMutation.isPending} disabled={!title || synopsis.length < 10} onClick={() => saveMutation.mutate()}>
                Save metadata
              </Button>
              <Button
                variant="light"
                loading={submitMutation.isPending}
                disabled={!novelId || novelQuery.data?.status === 'PUBLISHED' || novelQuery.data?.status === 'PENDING_MODERATION'}
                onClick={() => submitMutation.mutate()}
              >
                Submit novel
              </Button>
            </Group>
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>Project Health</Title>
            <Group gap="xs">
              <Badge variant="light">{chapters.length} chapters</Badge>
              {Object.entries(statusCounts).map(([status, count]) => (
                <Badge key={status} variant="outline">
                  {status}: {count}
                </Badge>
              ))}
            </Group>
            <Text size="sm" c="dimmed">
              Genre and tags are defined in API schema, but current backend metadata update only persists title, synopsis, and cover.
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper p="md" withBorder mt="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Chapters</Title>
          <Text size="sm" c="dimmed">
            Deep links open the IDE with stable URL params.
          </Text>
        </Group>
        <Stack gap="xs">
          {chapters.map((chapter) => (
            <Paper key={chapter.chapterId} p="sm" withBorder>
              <Group justify="space-between">
                <Box>
                  <Text fw={700}>
                    Ch. {chapter.chapterNumber}: {chapter.title}
                  </Text>
                  <Group gap="xs" mt={4}>
                    <Badge size="sm">{chapter.status}</Badge>
                    {chapter.isVip ? <Badge size="sm" color="yellow">VIP {chapter.priceCoins}</Badge> : <Badge size="sm" color="green">Free</Badge>}
                    <Badge size="sm" variant="outline">{chapter.wordCount} words</Badge>
                  </Group>
                </Box>
                <Group gap="xs">
                  <Button size="xs" variant="light" onClick={() => navigate(`/author/novels/${novelId}/chapters/${chapter.chapterId}`)}>
                    Deep link
                  </Button>
                  <Button size="xs" onClick={() => openIde(chapter.chapterId)}>
                    Open in IDE
                  </Button>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
