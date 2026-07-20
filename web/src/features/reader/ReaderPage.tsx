import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Box, Button, Group, Paper, ScrollArea, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import {
  addToLibrary,
  followAuthor,
  getReaderChapter,
  getReaderNovel,
  likeNovel,
  listHistory,
  listLibrary,
  reportContent,
  searchPublishedNovels,
  syncHistory,
  type ReaderChapter,
  type ReaderNovel
} from './reader-api';

export function ReaderPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [selectedNovelId, setSelectedNovelId] = useState(localStorage.getItem('ephurin_reader_novel_id') ?? '');
  const [selectedChapterId, setSelectedChapterId] = useState(localStorage.getItem('ephurin_reader_chapter_id') ?? '');
  const [status, setStatus] = useState('Reader UI ready');

  const searchQuery = useQuery({ queryKey: ['reader-search', q], queryFn: () => searchPublishedNovels(q) });
  const novelQuery = useQuery({
    queryKey: ['reader-novel', selectedNovelId],
    queryFn: () => getReaderNovel(selectedNovelId),
    enabled: Boolean(selectedNovelId)
  });
  const chapterQuery = useQuery({
    queryKey: ['reader-chapter', selectedChapterId],
    queryFn: () => getReaderChapter(selectedChapterId),
    enabled: Boolean(selectedChapterId)
  });
  const libraryQuery = useQuery({ queryKey: ['reader-library'], queryFn: listLibrary });
  const historyQuery = useQuery({ queryKey: ['reader-history'], queryFn: listHistory });

  const chapters = useMemo(() => novelQuery.data?.chapters ?? [], [novelQuery.data]);

  const selectNovel = (novel: ReaderNovel) => {
    setSelectedNovelId(novel.novelId);
    localStorage.setItem('ephurin_reader_novel_id', novel.novelId);
  };

  const selectChapter = (chapter: ReaderChapter) => {
    setSelectedChapterId(chapter.chapterId);
    localStorage.setItem('ephurin_reader_chapter_id', chapter.chapterId);
  };

  const libraryMutation = useMutation({
    mutationFn: () => addToLibrary(selectedNovelId),
    onSuccess: async () => {
      setStatus('Added to library');
      await queryClient.invalidateQueries({ queryKey: ['reader-library'] });
    }
  });

  const likeMutation = useMutation({
    mutationFn: () => likeNovel(selectedNovelId),
    onSuccess: () => setStatus('Novel liked')
  });

  const followMutation = useMutation({
    mutationFn: () => followAuthor(novelQuery.data?.authorId ?? ''),
    onSuccess: () => setStatus('Author followed')
  });

  const historyMutation = useMutation({
    mutationFn: () => syncHistory({ novelId: selectedNovelId, chapterId: selectedChapterId }),
    onSuccess: async () => {
      setStatus('Reading history synced');
      await queryClient.invalidateQueries({ queryKey: ['reader-history'] });
    }
  });

  const reportMutation = useMutation({
    mutationFn: () => reportContent({ targetType: 'CHAPTER', targetId: selectedChapterId, reason: 'Reader review report' }),
    onSuccess: () => setStatus('Report submitted')
  });

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>Reader Web</Title>
          <Text c="dimmed">Browse, read, library, history, likes, follows, reports.</Text>
        </Box>
        <Badge variant="light">{status}</Badge>
      </Group>

      <Box className="phase-grid">
        <Paper p="md" withBorder>
          <Stack>
            <TextInput label="Search novels" value={q} onChange={(event) => setQ(event.currentTarget.value)} />
            <ScrollArea h={260}>
              <Stack gap="xs">
                {(searchQuery.data ?? []).map((novel) => (
                  <Button key={novel.novelId} variant="subtle" justify="space-between" onClick={() => selectNovel(novel)}>
                    {novel.title}
                  </Button>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>{novelQuery.data?.title ?? 'No novel selected'}</Title>
            <Text size="sm" c="dimmed" lineClamp={3}>
              {novelQuery.data?.synopsis ?? 'Select a published novel from search results.'}
            </Text>
            <Group>
              <Button size="xs" disabled={!selectedNovelId} onClick={() => libraryMutation.mutate()}>
                Add library
              </Button>
              <Button size="xs" variant="light" disabled={!selectedNovelId} onClick={() => likeMutation.mutate()}>
                Like
              </Button>
              <Button size="xs" variant="light" disabled={!novelQuery.data?.authorId} onClick={() => followMutation.mutate()}>
                Follow author
              </Button>
            </Group>
            <Text fw={700}>Chapters</Text>
            {chapters.map((chapter) => (
              <Button key={chapter.chapterId} size="xs" variant="subtle" onClick={() => selectChapter(chapter)}>
                Ch.{chapter.chapterNumber} {chapter.title} {chapter.isVip ? `· VIP ${chapter.priceCoins}` : ''}
              </Button>
            ))}
          </Stack>
        </Paper>

        <Paper p="md" withBorder className="reader-panel">
          <Group justify="space-between">
            <Title order={4}>{chapterQuery.data?.title ?? 'Reader'}</Title>
            <Group gap="xs">
              <Button size="xs" disabled={!selectedChapterId || !selectedNovelId} onClick={() => historyMutation.mutate()}>
                Sync history
              </Button>
              <Button size="xs" color="red" variant="light" disabled={!selectedChapterId} onClick={() => reportMutation.mutate()}>
                Report
              </Button>
            </Group>
          </Group>
          <Textarea
            mt="md"
            value={chapterQuery.data?.content ?? ''}
            placeholder={chapterQuery.isError ? 'VIP chapter may require unlock in Wallet page.' : 'Select a chapter to read.'}
            readOnly
            autosize
            minRows={16}
          />
        </Paper>

        <Paper p="md" withBorder>
          <Group grow align="flex-start">
            <Stack>
              <Text fw={700}>Library</Text>
              {(libraryQuery.data ?? []).map((item) => (
                <Text key={item.novelId} size="sm">
                  {item.title ?? item.novelId}
                </Text>
              ))}
            </Stack>
            <Stack>
              <Text fw={700}>History</Text>
              {(historyQuery.data ?? []).map((item) => (
                <Text key={item.novelId} size="sm">
                  {item.title ?? item.novelId}
                </Text>
              ))}
            </Stack>
          </Group>
        </Paper>
      </Box>
    </Box>
  );
}
