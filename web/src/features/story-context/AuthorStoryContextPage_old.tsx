import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getNovel, listChapters } from '../novels/novel-api';
import type { Chapter } from '../novels/novel-types';
import {
  createCharacter,
  createCharacterRelationship,
  createPlotSummary,
  createTimelineEvent,
  deleteCharacter,
  deleteCharacterRelationship,
  deletePlotSummary,
  deleteTimelineEvent,
  listCharacterRelationships,
  listCharacters,
  listPlotSummaries,
  listTimelineEvents,
  updateCharacter,
  updateCharacterRelationship,
  updatePlotSummary,
  updateTimelineEvent,
  type CreateCharacterPayload,
  type CreatePlotSummaryPayload,
  type CreateRelationshipPayload,
  type CreateTimelineEventPayload
} from './story-context-api';
import type { CharacterProfile, CharacterRelationship, PlotSummary, StoryTimelineEvent } from './story-context-types';

const characterRoles = [
  { value: 'PROTAGONIST', label: 'Protagonist' },
  { value: 'ANTAGONIST', label: 'Antagonist' },
  { value: 'SUPPORTING', label: 'Supporting' },
  { value: 'MINOR', label: 'Minor' }
];

const summaryScopes = [
  { value: 'NOVEL', label: 'Novel' },
  { value: 'ARC', label: 'Arc' },
  { value: 'CHAPTER', label: 'Chapter' }
];

const emptyCharacterForm: CreateCharacterPayload = {
  name: '',
  role: 'SUPPORTING',
  personality: '',
  description: '',
  notes: '',
  source: 'AUTHOR_MANUAL'
};

const emptyRelationshipForm: CreateRelationshipPayload = {
  sourceCharacterId: '',
  targetCharacterId: '',
  relationshipType: '',
  description: ''
};

const emptyTimelineForm: CreateTimelineEventPayload = {
  title: '',
  eventOrder: 1,
  chapterId: null,
  summary: '',
  source: 'AUTHOR_MANUAL'
};

const emptySummaryForm: CreatePlotSummaryPayload = {
  scope: 'NOVEL',
  arcName: '',
  chapterId: null,
  startChapterNumber: null,
  endChapterNumber: null,
  summary: '',
  source: 'AUTHOR_MANUAL'
};

export function AuthorStoryContextPage() {
  const { novelId = '' } = useParams();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);
  const [characterForm, setCharacterForm] = useState<CreateCharacterPayload>(emptyCharacterForm);
  const [relationshipForm, setRelationshipForm] = useState<CreateRelationshipPayload>(emptyRelationshipForm);
  const [timelineForm, setTimelineForm] = useState<CreateTimelineEventPayload>(emptyTimelineForm);
  const [summaryForm, setSummaryForm] = useState<CreatePlotSummaryPayload>(emptySummaryForm);

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

  const charactersQuery = useQuery({
    queryKey: ['story-context', novelId, 'characters'],
    queryFn: () => listCharacters(novelId),
    enabled: Boolean(novelId)
  });

  const relationshipsQuery = useQuery({
    queryKey: ['story-context', novelId, 'relationships'],
    queryFn: () => listCharacterRelationships(novelId),
    enabled: Boolean(novelId)
  });

  const timelineQuery = useQuery({
    queryKey: ['story-context', novelId, 'timeline-events'],
    queryFn: () => listTimelineEvents(novelId),
    enabled: Boolean(novelId)
  });

  const summariesQuery = useQuery({
    queryKey: ['story-context', novelId, 'plot-summaries'],
    queryFn: () => listPlotSummaries(novelId),
    enabled: Boolean(novelId)
  });

  const characters = charactersQuery.data ?? [];
  const relationships = relationshipsQuery.data ?? [];
  const timelineEvents = timelineQuery.data ?? [];
  const plotSummaries = summariesQuery.data ?? [];
  const chapters = chaptersQuery.data ?? [];

  const invalidateContext = async () => {
    await queryClient.invalidateQueries({ queryKey: ['story-context', novelId] });
  };

  const characterMutation = useMutation({
    mutationFn: () =>
      selectedCharacterId
        ? updateCharacter(selectedCharacterId, normalizeCharacterPayload(characterForm))
        : createCharacter(novelId, normalizeCharacterPayload(characterForm)),
    onSuccess: async (character) => {
      setSelectedCharacterId(character.characterId);
      setNotice(`Saved character ${character.name}`);
      await invalidateContext();
    },
    onError: (error) => setNotice(getApiErrorMessage(error))
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (characterId: string) => deleteCharacter(characterId),
    onSuccess: async () => {
      setSelectedCharacterId(null);
      setCharacterForm(emptyCharacterForm);
      setNotice('Character archived.');
      await invalidateContext();
    },
    onError: (error) => setNotice(getApiErrorMessage(error))
  });

  const relationshipMutation = useMutation({
    mutationFn: () =>
      selectedRelationshipId
        ? updateCharacterRelationship(selectedRelationshipId, normalizeRelationshipPayload(relationshipForm))
        : createCharacterRelationship(novelId, normalizeRelationshipPayload(relationshipForm)),
    onSuccess: async (relationship) => {
      setSelectedRelationshipId(relationship.relationshipId);
      setNotice(`Saved relationship ${relationship.relationshipType}`);
      await invalidateContext();
    },
    onError: (error) => setNotice(getApiErrorMessage(error))
  });

  const deleteRelationshipMutation = useMutation({
    mutationFn: (relationshipId: string) => deleteCharacterRelationship(relationshipId),
    onSuccess: async () => {
      setSelectedRelationshipId(null);
      setRelationshipForm(emptyRelationshipForm);
      setNotice('Relationship deleted.');
      await invalidateContext();
    },
    onError: (error) => setNotice(getApiErrorMessage(error))
  });

  const timelineMutation = useMutation({
    mutationFn: () =>
      selectedEventId
        ? updateTimelineEvent(selectedEventId, normalizeTimelinePayload(timelineForm))
        : createTimelineEvent(novelId, normalizeTimelinePayload(timelineForm)),
    onSuccess: async (event) => {
      setSelectedEventId(event.eventId);
      setNotice(`Saved timeline event ${event.title}`);
      await invalidateContext();
    },
    onError: (error) => setNotice(getApiErrorMessage(error))
  });

  const deleteTimelineMutation = useMutation({
    mutationFn: (eventId: string) => deleteTimelineEvent(eventId),
    onSuccess: async () => {
      setSelectedEventId(null);
      setTimelineForm(emptyTimelineForm);
      setNotice('Timeline event archived.');
      await invalidateContext();
    },
    onError: (error) => setNotice(getApiErrorMessage(error))
  });

  const summaryMutation = useMutation({
    mutationFn: () =>
      selectedSummaryId
        ? updatePlotSummary(selectedSummaryId, normalizeSummaryPayload(summaryForm))
        : createPlotSummary(novelId, normalizeSummaryPayload(summaryForm)),
    onSuccess: async (summary) => {
      setSelectedSummaryId(summary.summaryId);
      setNotice(`Saved summary ${formatSummaryTitle(summary)}`);
      await invalidateContext();
    },
    onError: (error) => setNotice(getApiErrorMessage(error))
  });

  const deleteSummaryMutation = useMutation({
    mutationFn: (summaryId: string) => deletePlotSummary(summaryId),
    onSuccess: async () => {
      setSelectedSummaryId(null);
      setSummaryForm(emptySummaryForm);
      setNotice('Plot summary archived.');
      await invalidateContext();
    },
    onError: (error) => setNotice(getApiErrorMessage(error))
  });

  useEffect(() => {
    const selectedCharacter = characters.find((character) => character.characterId === selectedCharacterId);
    if (selectedCharacter) setCharacterForm(characterToForm(selectedCharacter));
  }, [characters, selectedCharacterId]);

  useEffect(() => {
    const selectedRelationship = relationships.find((relationship) => relationship.relationshipId === selectedRelationshipId);
    if (selectedRelationship) setRelationshipForm(relationshipToForm(selectedRelationship));
  }, [relationships, selectedRelationshipId]);

  useEffect(() => {
    const selectedEvent = timelineEvents.find((event) => event.eventId === selectedEventId);
    if (selectedEvent) setTimelineForm(timelineToForm(selectedEvent));
  }, [selectedEventId, timelineEvents]);

  useEffect(() => {
    const selectedSummary = plotSummaries.find((summary) => summary.summaryId === selectedSummaryId);
    if (selectedSummary) setSummaryForm(summaryToForm(selectedSummary));
  }, [plotSummaries, selectedSummaryId]);

  const selectedCharacterRelationships = useMemo(
    () =>
      relationships.filter(
        (relationship) =>
          relationship.sourceCharacterId === selectedCharacterId || relationship.targetCharacterId === selectedCharacterId
      ),
    [relationships, selectedCharacterId]
  );

  const characterOptions = characters.map((character) => ({
    value: character.characterId,
    label: `${character.name} · ${character.role}`
  }));

  const chapterOptions = chapters.map((chapter) => ({
    value: chapter.chapterId,
    label: `Ch.${chapter.chapterNumber} · ${chapter.draft?.title ?? chapter.title}`
  }));

  const contextLoading =
    novelQuery.isLoading ||
    chaptersQuery.isLoading ||
    charactersQuery.isLoading ||
    relationshipsQuery.isLoading ||
    timelineQuery.isLoading ||
    summariesQuery.isLoading;
  const contextError =
    novelQuery.error ??
    chaptersQuery.error ??
    charactersQuery.error ??
    relationshipsQuery.error ??
    timelineQuery.error ??
    summariesQuery.error;

  if (contextLoading) return <LoadingState label="Loading story context..." />;
  if (contextError) {
    return (
      <ErrorState
        error={contextError}
        onRetry={() => {
          void novelQuery.refetch();
          void chaptersQuery.refetch();
          void charactersQuery.refetch();
          void relationshipsQuery.refetch();
          void timelineQuery.refetch();
          void summariesQuery.refetch();
        }}
      />
    );
  }

  return (
    <Box className="ide-shell">
      <Group className="top-toolbar" justify="space-between">
        <Group gap="sm">
          <Text fw={800}>Ephurin IDE</Text>
          <Badge variant="light">Context Manager</Badge>
          <Badge size="sm" color="violet" variant="outline">
            {novelQuery.data?.title ?? 'Unknown Project'}
          </Badge>
        </Group>
        <Group gap="xs">
          <Button component={Link} to={`/author/novels/${novelId}`} variant="light">
            Metadata
          </Button>
          <Button component={Link} to={`/author/ide?novelId=${novelId}`}>
            Open in IDE
          </Button>
        </Group>
      </Group>

      <Box className="context-ide-body">
        <Stack className="activity-bar" gap="xs" align="center">
          <Badge color="violet">C</Badge>
          <Badge color="blue">R</Badge>
          <Badge color="teal">T</Badge>
          <Badge color="grape">S</Badge>
        </Stack>

        <Paper className="dynamic-sidebar" radius={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Story Context
          </Text>
          <Title order={4} mt="sm">
            {novelQuery.data?.title ?? 'Current Project'}
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Manage context inside the Author IDE workspace.
          </Text>
          <Stack gap="xs" mt="md">
            <Badge variant="light">{characters.length} Characters</Badge>
            <Badge variant="light">{relationships.length} Relationships</Badge>
            <Badge variant="light">{timelineEvents.length} Timeline Events</Badge>
            <Badge variant="light">{plotSummaries.length} Plot Summaries</Badge>
          </Stack>
          <Button component={Link} to={`/author/ide?novelId=${novelId}`} variant="light" fullWidth mt="md">
            Back to IDE
          </Button>
        </Paper>

        <Box className="context-workspace">
          <Group justify="space-between" mb="lg">
            <Box>
              <Title order={2}>Story Context Manager</Title>
              <Text size="sm" c="dimmed">
                Characters, relationships, timeline events, and plot summaries for this novel.
              </Text>
            </Box>
          </Group>

          {notice ? (
            <Alert color={notice.includes(':') ? 'red' : 'green'} mb="md" withCloseButton onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          ) : null}

          <Alert color="blue" mb="md">
            Use <b>New</b> to create records. Select any item in the left list to edit it; delete/archive actions appear in the right form.
          </Alert>

          <Tabs defaultValue="characters">
        <Tabs.List>
          <Tabs.Tab value="characters">Characters</Tabs.Tab>
          <Tabs.Tab value="relationships">Relationships</Tabs.Tab>
          <Tabs.Tab value="timeline">Story Timeline</Tabs.Tab>
          <Tabs.Tab value="summaries">Plot Summaries</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="characters" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <ContextList
                title="Characters"
                count={characters.length}
                empty="No characters yet."
                items={characters.map((character) => ({
                  id: character.characterId,
                  title: character.name,
                  badge: character.role
                }))}
                selectedId={selectedCharacterId}
                onSelect={setSelectedCharacterId}
                onNew={() => {
                  setSelectedCharacterId(null);
                  setCharacterForm(emptyCharacterForm);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Paper p="md" withBorder>
                <Group justify="space-between" mb="md">
                  <Title order={3}>{selectedCharacterId ? 'Edit Character' : 'New Character'}</Title>
                  {selectedCharacterId ? (
                    <Button color="red" variant="light" onClick={() => deleteCharacterMutation.mutate(selectedCharacterId)}>
                      Archive
                    </Button>
                  ) : null}
                </Group>
                <Stack>
                  <TextInput
                    label="Name"
                    value={characterForm.name}
                    onChange={(event) => setCharacterForm({ ...characterForm, name: event.currentTarget.value })}
                  />
                  <Select
                    label="Role"
                    data={characterRoles}
                    value={characterForm.role}
                    onChange={(value) => setCharacterForm({ ...characterForm, role: (value ?? 'SUPPORTING') as never })}
                  />
                  <Textarea
                    label="Description"
                    minRows={3}
                    value={characterForm.description ?? ''}
                    onChange={(event) => setCharacterForm({ ...characterForm, description: event.currentTarget.value })}
                  />
                  <Textarea
                    label="Personality"
                    minRows={3}
                    value={characterForm.personality ?? ''}
                    onChange={(event) => setCharacterForm({ ...characterForm, personality: event.currentTarget.value })}
                  />
                  <Textarea
                    label="Author Notes"
                    minRows={3}
                    value={characterForm.notes ?? ''}
                    onChange={(event) => setCharacterForm({ ...characterForm, notes: event.currentTarget.value })}
                  />
                  <Button loading={characterMutation.isPending} disabled={!characterForm.name.trim()} onClick={() => characterMutation.mutate()}>
                    Save Character
                  </Button>
                </Stack>
              </Paper>

              {selectedCharacterId ? (
                <Paper p="md" withBorder mt="md">
                  <Group justify="space-between" mb="sm">
                    <Title order={4}>Related Relationships</Title>
                    <Badge variant="light">{selectedCharacterRelationships.length}</Badge>
                  </Group>
                  {selectedCharacterRelationships.length ? (
                    <SimpleRelationshipList relationships={selectedCharacterRelationships} />
                  ) : (
                    <Text size="sm" c="dimmed">No relationship records for this character yet.</Text>
                  )}
                </Paper>
              ) : null}
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="relationships" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <ContextList
                title="Relationships"
                count={relationships.length}
                empty="Create at least two characters, then connect them here."
                items={relationships.map((relationship) => ({
                  id: relationship.relationshipId,
                  title: `${relationship.sourceCharacterName} → ${relationship.targetCharacterName}`,
                  badge: relationship.relationshipType
                }))}
                selectedId={selectedRelationshipId}
                onSelect={setSelectedRelationshipId}
                onNew={() => {
                  setSelectedRelationshipId(null);
                  setRelationshipForm(emptyRelationshipForm);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper p="md" withBorder>
                <Group justify="space-between" mb="md">
                  <Title order={3}>{selectedRelationshipId ? 'Edit Relationship' : 'New Relationship'}</Title>
                  {selectedRelationshipId ? (
                    <Button color="red" variant="light" onClick={() => deleteRelationshipMutation.mutate(selectedRelationshipId)}>
                      Delete
                    </Button>
                  ) : null}
                </Group>
                <Stack>
                  <Select
                    label="Source Character"
                    data={characterOptions}
                    value={relationshipForm.sourceCharacterId}
                    onChange={(value) => setRelationshipForm({ ...relationshipForm, sourceCharacterId: value ?? '' })}
                  />
                  <Select
                    label="Target Character"
                    data={characterOptions}
                    value={relationshipForm.targetCharacterId}
                    onChange={(value) => setRelationshipForm({ ...relationshipForm, targetCharacterId: value ?? '' })}
                  />
                  <TextInput
                    label="Relationship Type"
                    placeholder="Mentor, rival, sibling..."
                    value={relationshipForm.relationshipType}
                    onChange={(event) => setRelationshipForm({ ...relationshipForm, relationshipType: event.currentTarget.value })}
                  />
                  <Textarea
                    label="Description"
                    minRows={4}
                    value={relationshipForm.description ?? ''}
                    onChange={(event) => setRelationshipForm({ ...relationshipForm, description: event.currentTarget.value })}
                  />
                  <Button
                    loading={relationshipMutation.isPending}
                    disabled={
                      !relationshipForm.sourceCharacterId ||
                      !relationshipForm.targetCharacterId ||
                      relationshipForm.sourceCharacterId === relationshipForm.targetCharacterId ||
                      !relationshipForm.relationshipType.trim()
                    }
                    onClick={() => relationshipMutation.mutate()}
                  >
                    Save Relationship
                  </Button>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="timeline" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <ContextList
                title="Timeline Events"
                count={timelineEvents.length}
                empty="No timeline events yet."
                items={timelineEvents.map((event) => ({
                  id: event.eventId,
                  title: `${event.eventOrder}. ${event.title}`,
                  badge: event.chapterNumber ? `Ch.${event.chapterNumber}` : 'No chapter'
                }))}
                selectedId={selectedEventId}
                onSelect={setSelectedEventId}
                onNew={() => {
                  setSelectedEventId(null);
                  setTimelineForm({ ...emptyTimelineForm, eventOrder: timelineEvents.length + 1 });
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper p="md" withBorder>
                <Group justify="space-between" mb="md">
                  <Title order={3}>{selectedEventId ? 'Edit Timeline Event' : 'New Timeline Event'}</Title>
                  {selectedEventId ? (
                    <Button color="red" variant="light" onClick={() => deleteTimelineMutation.mutate(selectedEventId)}>
                      Archive
                    </Button>
                  ) : null}
                </Group>
                <Stack>
                  <TextInput
                    label="Event Title"
                    value={timelineForm.title}
                    onChange={(event) => setTimelineForm({ ...timelineForm, title: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Event Order"
                    type="number"
                    value={String(timelineForm.eventOrder)}
                    onChange={(event) =>
                      setTimelineForm({ ...timelineForm, eventOrder: Number(event.currentTarget.value || 1) })
                    }
                  />
                  <Select
                    clearable
                    label="Linked Chapter"
                    data={chapterOptions}
                    value={timelineForm.chapterId ?? null}
                    onChange={(value) => setTimelineForm({ ...timelineForm, chapterId: value })}
                  />
                  <Textarea
                    label="Summary"
                    minRows={5}
                    value={timelineForm.summary}
                    onChange={(event) => setTimelineForm({ ...timelineForm, summary: event.currentTarget.value })}
                  />
                  <Button
                    loading={timelineMutation.isPending}
                    disabled={!timelineForm.title.trim() || !timelineForm.summary.trim()}
                    onClick={() => timelineMutation.mutate()}
                  >
                    Save Timeline Event
                  </Button>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="summaries" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <ContextList
                title="Plot Summaries"
                count={plotSummaries.length}
                empty="No summaries yet."
                items={plotSummaries.map((summary) => ({
                  id: summary.summaryId,
                  title: formatSummaryTitle(summary),
                  badge: summary.scope
                }))}
                selectedId={selectedSummaryId}
                onSelect={setSelectedSummaryId}
                onNew={() => {
                  setSelectedSummaryId(null);
                  setSummaryForm(emptySummaryForm);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper p="md" withBorder>
                <Group justify="space-between" mb="md">
                  <Title order={3}>{selectedSummaryId ? 'Edit Plot Summary' : 'New Plot Summary'}</Title>
                  {selectedSummaryId ? (
                    <Button color="red" variant="light" onClick={() => deleteSummaryMutation.mutate(selectedSummaryId)}>
                      Archive
                    </Button>
                  ) : null}
                </Group>
                <Stack>
                  <Select
                    label="Scope"
                    data={summaryScopes}
                    value={summaryForm.scope}
                    onChange={(value) => setSummaryForm({ ...summaryForm, scope: (value ?? 'NOVEL') as never })}
                  />
                  {summaryForm.scope === 'ARC' ? (
                    <TextInput
                      label="Arc Name"
                      value={summaryForm.arcName ?? ''}
                      onChange={(event) => setSummaryForm({ ...summaryForm, arcName: event.currentTarget.value })}
                    />
                  ) : null}
                  {summaryForm.scope === 'CHAPTER' ? (
                    <Select
                      label="Chapter"
                      data={chapterOptions}
                      value={summaryForm.chapterId ?? null}
                      onChange={(value) => setSummaryForm({ ...summaryForm, chapterId: value })}
                    />
                  ) : null}
                  {summaryForm.scope === 'ARC' ? (
                    <Group grow>
                      <TextInput
                        label="Start Chapter Number"
                        type="number"
                        value={summaryForm.startChapterNumber ? String(summaryForm.startChapterNumber) : ''}
                        onChange={(event) =>
                          setSummaryForm({
                            ...summaryForm,
                            startChapterNumber: event.currentTarget.value ? Number(event.currentTarget.value) : null
                          })
                        }
                      />
                      <TextInput
                        label="End Chapter Number"
                        type="number"
                        value={summaryForm.endChapterNumber ? String(summaryForm.endChapterNumber) : ''}
                        onChange={(event) =>
                          setSummaryForm({
                            ...summaryForm,
                            endChapterNumber: event.currentTarget.value ? Number(event.currentTarget.value) : null
                          })
                        }
                      />
                    </Group>
                  ) : null}
                  <Textarea
                    label="Summary"
                    minRows={7}
                    value={summaryForm.summary}
                    onChange={(event) => setSummaryForm({ ...summaryForm, summary: event.currentTarget.value })}
                  />
                  <Button
                    loading={summaryMutation.isPending}
                    disabled={!isSummaryFormValid(summaryForm)}
                    onClick={() => summaryMutation.mutate()}
                  >
                    Save Plot Summary
                  </Button>
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
          </Tabs>
        </Box>
      </Box>
    </Box>
  );
}

function ContextList({
  title,
  count,
  empty,
  items,
  selectedId,
  onSelect,
  onNew
}: {
  title: string;
  count: number;
  empty: string;
  items: Array<{ id: string; title: string; badge: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <Paper p="md" withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={4}>{title}</Title>
        <Badge variant="light">{count}</Badge>
      </Group>
      <Button size="xs" variant="light" fullWidth mb="sm" onClick={onNew}>
        New {title}
      </Button>
      {!items.length ? (
        <EmptyState description={empty} />
      ) : (
        <Stack gap="xs">
          {items.map((item) => (
            <Card
              key={item.id}
              p="sm"
              withBorder
              style={{ cursor: 'pointer' }}
              bg={selectedId === item.id ? 'var(--mantine-color-violet-light)' : undefined}
              onClick={() => onSelect(item.id)}
            >
              <Group justify="space-between">
                <Text fw={700} size="sm" lineClamp={1}>{item.title}</Text>
                <Group gap={4}>
                  <Badge size="xs" variant="outline">{item.badge}</Badge>
                  <Badge size="xs" color="violet">Edit</Badge>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

function SimpleRelationshipList({ relationships }: { relationships: CharacterRelationship[] }) {
  return (
    <Stack gap="xs">
      {relationships.map((relationship) => (
        <Card key={relationship.relationshipId} p="sm" withBorder>
          <Group gap="xs" mb={4}>
            <Text fw={700} size="sm">{relationship.sourceCharacterName}</Text>
            <Badge size="xs">{relationship.relationshipType}</Badge>
            <Text fw={700} size="sm">{relationship.targetCharacterName}</Text>
          </Group>
          <Text size="sm" c="dimmed">{relationship.description ?? 'No relationship notes yet.'}</Text>
        </Card>
      ))}
    </Stack>
  );
}

function characterToForm(character: CharacterProfile): CreateCharacterPayload {
  return {
    name: character.name,
    role: character.role,
    personality: character.personality ?? '',
    description: character.description ?? '',
    notes: character.notes ?? '',
    source: 'AUTHOR_MANUAL'
  };
}

function relationshipToForm(relationship: CharacterRelationship): CreateRelationshipPayload {
  return {
    sourceCharacterId: relationship.sourceCharacterId,
    targetCharacterId: relationship.targetCharacterId,
    relationshipType: relationship.relationshipType,
    description: relationship.description ?? ''
  };
}

function timelineToForm(event: StoryTimelineEvent): CreateTimelineEventPayload {
  return {
    title: event.title,
    eventOrder: event.eventOrder,
    chapterId: event.chapterId,
    summary: event.summary,
    source: 'AUTHOR_MANUAL'
  };
}

function summaryToForm(summary: PlotSummary): CreatePlotSummaryPayload {
  return {
    scope: summary.scope,
    arcName: summary.arcName ?? '',
    chapterId: summary.chapterId,
    startChapterNumber: summary.startChapterNumber,
    endChapterNumber: summary.endChapterNumber,
    summary: summary.summary,
    source: 'AUTHOR_MANUAL'
  };
}

function normalizeCharacterPayload(input: CreateCharacterPayload): CreateCharacterPayload {
  return {
    ...input,
    name: input.name.trim(),
    personality: nullableText(input.personality),
    description: nullableText(input.description),
    notes: nullableText(input.notes),
    source: 'AUTHOR_MANUAL'
  };
}

function normalizeRelationshipPayload(input: CreateRelationshipPayload): CreateRelationshipPayload {
  return {
    sourceCharacterId: input.sourceCharacterId,
    targetCharacterId: input.targetCharacterId,
    relationshipType: input.relationshipType.trim(),
    description: nullableText(input.description)
  };
}

function normalizeTimelinePayload(input: CreateTimelineEventPayload): CreateTimelineEventPayload {
  return {
    title: input.title.trim(),
    eventOrder: Number(input.eventOrder),
    chapterId: input.chapterId || null,
    summary: input.summary.trim(),
    source: 'AUTHOR_MANUAL'
  };
}

function normalizeSummaryPayload(input: CreatePlotSummaryPayload): CreatePlotSummaryPayload {
  return {
    scope: input.scope,
    arcName: input.scope === 'ARC' ? input.arcName?.trim() : null,
    chapterId: input.scope === 'CHAPTER' ? input.chapterId : null,
    startChapterNumber: input.scope === 'ARC' ? input.startChapterNumber : null,
    endChapterNumber: input.scope === 'ARC' ? input.endChapterNumber : null,
    summary: input.summary.trim(),
    source: 'AUTHOR_MANUAL'
  };
}

function nullableText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function isSummaryFormValid(input: CreatePlotSummaryPayload) {
  if (!input.summary.trim()) return false;
  if (input.scope === 'ARC') return Boolean(input.arcName?.trim());
  if (input.scope === 'CHAPTER') return Boolean(input.chapterId);
  return true;
}

function formatSummaryTitle(summary: { scope: string; arcName: string | null; chapterNumber: number | null }) {
  if (summary.scope === 'NOVEL') return 'Novel Summary';
  if (summary.scope === 'ARC') return `Arc: ${summary.arcName ?? 'Untitled Arc'}`;
  return summary.chapterNumber ? `Chapter ${summary.chapterNumber} Summary` : 'Chapter Summary';
}
