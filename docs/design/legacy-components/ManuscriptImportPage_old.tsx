import { Alert, Badge, Box, Button, Code, Group, Paper, Progress, Stack, Text, Textarea, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  acceptProposalGroup,
  activateBaseline,
  getBootstrapJob,
  getReviewQueue,
  getStoryBrainSummary,
  rejectProposal,
  startManuscriptBootstrap,
  type BootstrapRevisionInput,
  type ReviewProposal
} from './manuscript-import-api';

const exampleManifest = JSON.stringify(
  [{ chapter_id: 'chapter-uuid', revision_id: 'revision-uuid', content_hash: 'sha256-64-hex' }],
  null,
  2
);

export function ManuscriptImportPage() {
  const { novelId = '' } = useParams();
  const queryClient = useQueryClient();
  const [manifest, setManifest] = useState(exampleManifest);
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ['manuscript-bootstrap-job', jobId],
    queryFn: () => getBootstrapJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.status ?? '') ? 1000 : false
  });
  const reviewQuery = useQuery({
    queryKey: ['manuscript-review-queue', novelId],
    queryFn: () => getReviewQueue(novelId),
    enabled: jobQuery.data?.status === 'waiting_review'
  });
  const brainQuery = useQuery({
    queryKey: ['story-brain-summary', novelId],
    queryFn: () => getStoryBrainSummary(novelId),
    enabled: Boolean(novelId)
  });
  const groups = useMemo(() => {
    const grouped = new Map<string, ReviewProposal[]>();
    for (const proposal of reviewQuery.data ?? []) {
      const key = proposal.dependency_group_id || proposal.proposal_id;
      grouped.set(key, [...(grouped.get(key) ?? []), proposal]);
    }
    return [...grouped.entries()];
  }, [reviewQuery.data]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const revisions = JSON.parse(manifest) as BootstrapRevisionInput[];
      if (!Array.isArray(revisions) || !revisions.length) throw new Error('Manifest must contain revisions.');
      return startManuscriptBootstrap(novelId, revisions);
    },
    onSuccess: (result) => {
      setJobId(result.job_id);
      setMessage('Import accepted. Progress is saved after every chapter.');
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Import failed.')
  });
  const acceptMutation = useMutation({
    mutationFn: ({ groupId, proposals }: { groupId: string; proposals: ReviewProposal[] }) =>
      acceptProposalGroup(
        groupId,
        proposals.map((item) => item.proposal_id),
        brainQuery.data?.brain_version ?? 1
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] }),
        queryClient.invalidateQueries({ queryKey: ['story-brain-summary', novelId] })
      ]);
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Accept failed.')
  });
  const rejectMutation = useMutation({
    mutationFn: (proposals: ReviewProposal[]) =>
      Promise.all(proposals.map((item) => rejectProposal(item.proposal_id))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] });
    }
  });
  const activateMutation = useMutation({
    mutationFn: () => activateBaseline(novelId, jobId!),
    onSuccess: () => setMessage('Story Brain baseline is active. You can continue in the Author IDE.'),
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Activation failed.')
  });

  const job = jobQuery.data;
  const percent = job?.progress.total
    ? Math.round((job.progress.current / job.progress.total) * 100)
    : 0;

  return (
    <Box maw={1000} mx="auto" p="xl">
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>Import existing manuscript</Title>
          <Text c="dimmed">Analyze immutable revisions, review conflicts, then activate the baseline.</Text>
        </Box>
        <Button component={Link} to={`/author/novels/${novelId}`} variant="light">Back to project</Button>
      </Group>
      {message ? <Alert mb="md">{message}</Alert> : null}
      <Paper withBorder p="md" mb="md">
        <Stack>
          <Textarea
            label="Revision manifest"
            description="JSON from the Platform parser. Raw manuscript text remains in Platform."
            minRows={8}
            value={manifest}
            onChange={(event) => setManifest(event.currentTarget.value)}
          />
          <Button loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
            Start import
          </Button>
        </Stack>
      </Paper>
      {job ? (
        <Paper withBorder p="md" mb="md">
          <Group justify="space-between">
            <Text fw={600}>Job {job.job_id}</Text>
            <Badge>{job.status}</Badge>
          </Group>
          <Progress value={percent} mt="sm" />
          <Text size="sm" mt="xs">{job.progress.current}/{job.progress.total} chapters · {job.progress.stage}</Text>
          {job.error?.message ? <Alert color="red" mt="sm">{job.error.message}</Alert> : null}
        </Paper>
      ) : null}
      {job?.status === 'waiting_review' ? (
        <Stack>
          <Group justify="space-between">
            <Title order={3}>Priority review queue</Title>
            <Button
              color="green"
              disabled={Boolean((reviewQuery.data ?? []).length)}
              loading={activateMutation.isPending}
              onClick={() => activateMutation.mutate()}
            >
              Activate baseline
            </Button>
          </Group>
          {groups.map(([groupId, proposals]) => (
            <Paper key={groupId} withBorder p="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4} style={{ flex: 1 }}>
                  <Group>
                    <Badge color="orange">Priority {Math.max(...proposals.map((item) => item.review_priority))}</Badge>
                    <Badge variant="outline">{proposals[0].review_reason}</Badge>
                  </Group>
                  <Text fw={600}>{proposals.map((item) => item.proposal_type).join(', ')}</Text>
                  <Code block>{JSON.stringify(proposals.map((item) => item.payload), null, 2)}</Code>
                </Stack>
                <Group>
                  <Button size="xs" onClick={() => acceptMutation.mutate({ groupId, proposals })}>
                    Accept group
                  </Button>
                  <Button size="xs" color="red" variant="light" onClick={() => rejectMutation.mutate(proposals)}>
                    Reject group
                  </Button>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
