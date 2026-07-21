import { Alert, Badge, Box, Button, Group, Modal, Paper, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  approveWithdrawRequest,
  createGenre,
  createTag,
  getDashboardStats,
  getModerationReview,
  getTaxonomy,
  listAdminUsers,
  listModerationReviews,
  listWithdrawRequests,
  lockUser,
  rejectWithdrawRequest,
  resolveModerationReview,
  unlockUser,
  type ModerationReview,
  type ModerationReviewFilters
} from './admin-api';
import { useAuthStore } from '../auth/useAuthStore';
import { EmptyState, ErrorState, LoadingState, PermissionState } from '../../shared/components/PageStates';

type PendingAdminAction = {
  title: string;
  description: string;
  confirmLabel: string;
  color?: string;
  run: () => void;
};

export function AdminPage({ initialTab = 'users' }: { initialTab?: 'users' | 'taxonomy' | 'moderation' | 'withdraw' }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const [userSearch, setUserSearch] = useState('');
  const [taxonomyName, setTaxonomyName] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(null);
  const statsQuery = useQuery({ queryKey: ['admin-stats'], queryFn: getDashboardStats, enabled: isAdmin });
  const usersQuery = useQuery({ queryKey: ['admin-users', userSearch], queryFn: () => listAdminUsers(userSearch), enabled: isAdmin });
  const taxonomyQuery = useQuery({ queryKey: ['admin-taxonomy'], queryFn: getTaxonomy, enabled: isAdmin });
  const moderationQuery = useQuery({ queryKey: ['admin-moderation'], queryFn: () => listModerationReviews(), enabled: isAdmin });
  const withdrawQuery = useQuery({ queryKey: ['admin-withdraw'], queryFn: () => listWithdrawRequests('PENDING'), enabled: isAdmin });

  const invalidateAdmin = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-taxonomy'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-moderation'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-withdraw'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  const lockMutation = useMutation({ mutationFn: lockUser, onSuccess: invalidateAdmin });
  const unlockMutation = useMutation({ mutationFn: unlockUser, onSuccess: invalidateAdmin });
  const genreMutation = useMutation({ mutationFn: createGenre, onSuccess: invalidateAdmin });
  const tagMutation = useMutation({ mutationFn: createTag, onSuccess: invalidateAdmin });
  const approveWithdrawMutation = useMutation({ mutationFn: approveWithdrawRequest, onSuccess: invalidateAdmin });
  const rejectWithdrawMutation = useMutation({ mutationFn: rejectWithdrawRequest, onSuccess: invalidateAdmin });
  const resolveMutation = useMutation({
    mutationFn: (input: { reviewId: string; decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED' }) =>
      resolveModerationReview(input.reviewId, input.decision),
    onSuccess: invalidateAdmin
  });

  const confirmAction = (action: PendingAdminAction) => setPendingAction(action);
  const runPendingAction = () => {
    pendingAction?.run();
    setPendingAction(null);
  };

  if (!isAdmin) {
    return <PermissionState requiredRole="ADMIN" />;
  }

  return (
    <Box>
      <Modal opened={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={pendingAction?.title}>
        <Stack>
          <Text size="sm" c="dimmed">
            {pendingAction?.description}
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button color={pendingAction?.color} onClick={runPendingAction}>
              {pendingAction?.confirmLabel ?? 'Confirm'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>Admin Console</Title>
          <Text c="dimmed">Dashboard, users, taxonomy, moderation and withdraw review.</Text>
        </Box>
        <Badge variant="light">Admin API</Badge>
      </Group>
      <Group mb="md">
        <Button component={Link} to="/admin/moderation" variant="light">
          Open moderation queue
        </Button>
        <Button component={Link} to="/admin/reports" variant="light">
          Open user reports
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        <StatCard label="Users" value={statsQuery.data?.totalUsers ?? 0} />
        <StatCard label="Novels" value={statsQuery.data?.totalNovels ?? 0} />
        <StatCard label="Pending moderation" value={statsQuery.data?.pendingModerationItems ?? 0} />
        <StatCard label="Mock revenue" value={statsQuery.data?.mockRevenueCoins ?? 0} />
      </SimpleGrid>

      <Tabs defaultValue={initialTab}>
        <Tabs.List>
          <Tabs.Tab value="users">Users</Tabs.Tab>
          <Tabs.Tab value="taxonomy">Taxonomy</Tabs.Tab>
          <Tabs.Tab value="moderation">Moderation</Tabs.Tab>
          <Tabs.Tab value="withdraw">Withdraw</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users" pt="md">
          <Paper p="md" withBorder>
            <TextInput label="Search users" value={userSearch} onChange={(event) => setUserSearch(event.currentTarget.value)} mb="md" />
            {usersQuery.isLoading ? <LoadingState label="Loading users..." /> : null}
            {usersQuery.isError ? <ErrorState error={usersQuery.error} onRetry={() => void usersQuery.refetch()} /> : null}
            {!usersQuery.isLoading && !usersQuery.isError ? (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>User</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Action</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(usersQuery.data ?? []).map((user) => (
                    <Table.Tr key={user.userId}>
                      <Table.Td>{user.username}</Table.Td>
                      <Table.Td>{user.role}</Table.Td>
                      <Table.Td>{user.status}</Table.Td>
                      <Table.Td>
                        {user.status === 'LOCKED' ? (
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() =>
                              confirmAction({
                                title: 'Unlock user?',
                                description: `Unlock ${user.username} and allow account access again.`,
                                confirmLabel: 'Unlock',
                                run: () => unlockMutation.mutate(user.userId)
                              })
                            }
                          >
                            Unlock
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            onClick={() =>
                              confirmAction({
                                title: 'Lock user?',
                                description: `Lock ${user.username}. The user will not be able to use protected features.`,
                                confirmLabel: 'Lock',
                                color: 'red',
                                run: () => lockMutation.mutate(user.userId)
                              })
                            }
                          >
                            Lock
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : null}
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="taxonomy" pt="md">
          <Paper p="md" withBorder>
            <Group align="end" mb="md">
              <TextInput label="New genre/tag name" value={taxonomyName} onChange={(event) => setTaxonomyName(event.currentTarget.value)} />
              <Button disabled={!taxonomyName} onClick={() => genreMutation.mutate(taxonomyName)}>
                Add genre
              </Button>
              <Button disabled={!taxonomyName} variant="light" onClick={() => tagMutation.mutate(taxonomyName)}>
                Add tag
              </Button>
            </Group>
            <Group align="flex-start" grow>
              <Stack>
                <Text fw={700}>Genres</Text>
                {(taxonomyQuery.data?.genres ?? []).map((genre) => (
                  <Badge key={genre.genreId} variant="light">
                    {genre.name}
                  </Badge>
                ))}
              </Stack>
              <Stack>
                <Text fw={700}>Tags</Text>
                {(taxonomyQuery.data?.tags ?? []).map((tag) => (
                  <Badge key={tag.tagId} variant="outline">
                    {tag.name}
                  </Badge>
                ))}
              </Stack>
            </Group>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="moderation" pt="md">
          <Stack>
            {moderationQuery.isLoading ? <LoadingState label="Loading moderation queue..." /> : null}
            {moderationQuery.isError ? <ErrorState error={moderationQuery.error} onRetry={() => void moderationQuery.refetch()} /> : null}
            {!moderationQuery.isLoading && !moderationQuery.isError && !moderationQuery.data?.length ? (
              <EmptyState description="No moderation reviews are waiting right now." />
            ) : null}
            {(moderationQuery.data ?? []).map((review) => (
              <Paper key={review.reviewId} p="md" withBorder>
                <Group justify="space-between">
                  <Box>
                    <Group gap="xs">
                      <Badge>{review.targetType}</Badge>
                      <Badge color="yellow">{review.status}</Badge>
                      <Badge variant="outline">{review.source}</Badge>
                    </Group>
                    <Text size="sm" c="dimmed" mt={6}>
                      {review.targetId}
                    </Text>
                  </Box>
                  <Group gap="xs">
                    <Button component={Link} to={`/admin/moderation/${review.reviewId}`} size="xs" variant="light">
                      Detail
                    </Button>
                    <Button
                      size="xs"
                      onClick={() =>
                        confirmAction({
                          title: 'Approve moderation review?',
                          description: `Approve review ${review.reviewId}.`,
                          confirmLabel: 'Approve',
                          run: () => resolveMutation.mutate({ reviewId: review.reviewId, decision: 'APPROVED' })
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      onClick={() =>
                        confirmAction({
                          title: 'Reject moderation review?',
                          description: `Reject review ${review.reviewId}.`,
                          confirmLabel: 'Reject',
                          color: 'red',
                          run: () => resolveMutation.mutate({ reviewId: review.reviewId, decision: 'REJECTED' })
                        })
                      }
                    >
                      Reject
                    </Button>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="withdraw" pt="md">
          <Stack>
            {withdrawQuery.isLoading ? <LoadingState label="Loading withdraw requests..." /> : null}
            {withdrawQuery.isError ? <ErrorState error={withdrawQuery.error} onRetry={() => void withdrawQuery.refetch()} /> : null}
            {!withdrawQuery.isLoading && !withdrawQuery.isError && !withdrawQuery.data?.length ? (
              <EmptyState description="No pending withdraw requests are waiting right now." />
            ) : null}
            {(withdrawQuery.data ?? []).map((request) => (
              <Paper key={request.withdrawRequestId} p="md" withBorder>
                <Group justify="space-between">
                  <Box>
                    <Text fw={700}>{request.username}</Text>
                    <Text size="sm" c="dimmed">
                      {request.amountCoins} coins · {request.status}
                    </Text>
                  </Box>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      onClick={() =>
                        confirmAction({
                          title: 'Approve withdraw request?',
                          description: `Approve ${request.amountCoins} coins for ${request.username}.`,
                          confirmLabel: 'Approve withdraw',
                          run: () => approveWithdrawMutation.mutate(request.withdrawRequestId)
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      onClick={() =>
                        confirmAction({
                          title: 'Reject withdraw request?',
                          description: `Reject ${request.amountCoins} coins for ${request.username}.`,
                          confirmLabel: 'Reject withdraw',
                          color: 'red',
                          run: () => rejectWithdrawMutation.mutate(request.withdrawRequestId)
                        })
                      }
                    >
                      Reject
                    </Button>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}

export function AdminModerationPage({ sourceFilter = '' }: { sourceFilter?: ModerationReviewFilters['source'] }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const [filters, setFilters] = useState<ModerationReviewFilters>({
    source: sourceFilter,
    status: 'PENDING'
  });
  const reviewsQuery = useQuery({
    queryKey: ['admin-moderation', filters],
    queryFn: () => listModerationReviews(filters),
    enabled: isAdmin
  });

  if (!isAdmin) {
    return <PermissionState requiredRole="ADMIN" />;
  }

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>{sourceFilter === 'USER_REPORT' ? 'User Reports' : 'Moderation Queue'}</Title>
          <Text c="dimmed">
            Inspect review targets, keyword evidence, and user-report items before resolving them.
          </Text>
        </Box>
        <Button component={Link} to="/admin" variant="light">
          Back to Admin
        </Button>
      </Group>

      <Paper p="md" withBorder mb="md">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Select
            label="Target type"
            data={[
              { value: '', label: 'Any' },
              { value: 'NOVEL', label: 'Novel' },
              { value: 'CHAPTER', label: 'Chapter' },
              { value: 'COMMENT', label: 'Comment' },
              { value: 'USER', label: 'User' }
            ]}
            value={filters.targetType ?? ''}
            onChange={(value) => setFilters((current) => ({ ...current, targetType: (value ?? '') as ModerationReviewFilters['targetType'] }))}
          />
          <Select
            label="Status"
            data={[
              { value: '', label: 'Any' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'REVISION_REQUIRED', label: 'Revision required' }
            ]}
            value={filters.status ?? ''}
            onChange={(value) => setFilters((current) => ({ ...current, status: (value ?? '') as ModerationReviewFilters['status'] }))}
          />
          <Select
            label="Source"
            disabled={Boolean(sourceFilter)}
            data={[
              { value: '', label: 'Any' },
              { value: 'KEYWORD_FILTER', label: 'Keyword filter' },
              { value: 'USER_REPORT', label: 'User report' }
            ]}
            value={filters.source ?? ''}
            onChange={(value) => setFilters((current) => ({ ...current, source: (value ?? '') as ModerationReviewFilters['source'] }))}
          />
        </SimpleGrid>
      </Paper>

      {reviewsQuery.isLoading ? <LoadingState label="Loading moderation reviews..." /> : null}
      {reviewsQuery.isError ? <ErrorState error={reviewsQuery.error} onRetry={() => void reviewsQuery.refetch()} /> : null}
      {!reviewsQuery.isLoading && !reviewsQuery.isError && !reviewsQuery.data?.length ? (
        <EmptyState description={sourceFilter === 'USER_REPORT' ? 'No user-report reviews match the current filters.' : 'No moderation reviews match the current filters.'} />
      ) : null}
      <Stack>
        {(reviewsQuery.data ?? []).map((review) => (
          <ModerationReviewCard key={review.reviewId} review={review} />
        ))}
      </Stack>
    </Box>
  );
}

export function AdminModerationDetailPage() {
  const { reviewId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(null);
  const reviewQuery = useQuery({
    queryKey: ['admin-moderation-detail', reviewId],
    queryFn: () => getModerationReview(reviewId),
    enabled: isAdmin && Boolean(reviewId)
  });
  const resolveMutation = useMutation({
    mutationFn: (input: { decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED' }) =>
      resolveModerationReview(reviewId, input.decision),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-moderation'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-moderation-detail', reviewId] });
    }
  });

  const runPendingAction = () => {
    pendingAction?.run();
    setPendingAction(null);
  };

  if (!isAdmin) {
    return <PermissionState requiredRole="ADMIN" />;
  }

  if (reviewQuery.isLoading) {
    return <LoadingState label="Loading moderation detail..." />;
  }

  if (reviewQuery.isError) {
    return <ErrorState error={reviewQuery.error} onRetry={() => void reviewQuery.refetch()} />;
  }

  const review = reviewQuery.data;

  return (
    <Box>
      <Modal opened={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title={pendingAction?.title}>
        <Stack>
          <Text size="sm" c="dimmed">
            {pendingAction?.description}
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button color={pendingAction?.color} onClick={runPendingAction}>
              {pendingAction?.confirmLabel ?? 'Confirm'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>Moderation Detail</Title>
          <Text c="dimmed">{review?.reviewId}</Text>
        </Box>
        <Group>
          <Button variant="light" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button component={Link} to="/admin/moderation" variant="light">
            Queue
          </Button>
        </Group>
      </Group>

      {resolveMutation.isError ? (
        <Alert color="red" mb="md">
          {resolveMutation.error instanceof Error ? resolveMutation.error.message : 'Resolve failed'}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>Target metadata</Title>
            <Group gap="xs">
              <Badge>{review?.targetType}</Badge>
              <Badge color={review?.status === 'PENDING' ? 'yellow' : 'gray'}>{review?.status}</Badge>
              <Badge variant="outline">{review?.source}</Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Target ID
            </Text>
            <Text style={{ wordBreak: 'break-all' }}>{review?.targetId}</Text>
            <TargetNavigation review={review} />
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>Evidence summary</Title>
            <Text size="sm" c="dimmed">
              Mongo evidence is summarized by backend from `moderation_evidence`; raw documents stay server-side.
            </Text>
            <Badge variant="light">Reports: {review?.evidenceSummary.reportCount ?? 0}</Badge>
            <Text>{review?.evidenceSummary.summary ?? 'No keyword evidence summary available.'}</Text>
            <Group gap="xs">
              {(review?.evidenceSummary.matchedRules ?? []).length ? (
                review?.evidenceSummary.matchedRules.map((rule) => (
                  <Badge key={rule} color="red" variant="light">
                    {rule}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline">No matched keyword rule</Badge>
              )}
            </Group>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper p="md" withBorder mt="md">
        <Group justify="space-between">
          <Box>
            <Title order={4}>Decision</Title>
            <Text size="sm" c="dimmed">
              Approve/reject actions require confirmation and only work while the review is pending.
            </Text>
          </Box>
          <Group>
            <Button
              disabled={review?.status !== 'PENDING'}
              loading={resolveMutation.isPending}
              onClick={() =>
                setPendingAction({
                  title: 'Approve moderation review?',
                  description: `Approve ${review?.reviewId}. Related content remains available/approved.`,
                  confirmLabel: 'Approve',
                  run: () => resolveMutation.mutate({ decision: 'APPROVED' })
                })
              }
            >
              Approve
            </Button>
            <Button
              color="red"
              variant="light"
              disabled={review?.status !== 'PENDING'}
              loading={resolveMutation.isPending}
              onClick={() =>
                setPendingAction({
                  title: 'Reject moderation review?',
                  description: `Reject ${review?.reviewId}. Comment targets are propagated to rejected status by backend.`,
                  confirmLabel: 'Reject',
                  color: 'red',
                  run: () => resolveMutation.mutate({ decision: 'REJECTED' })
                })
              }
            >
              Reject
            </Button>
          </Group>
        </Group>
      </Paper>
    </Box>
  );
}

function ModerationReviewCard({ review }: { review: ModerationReview }) {
  return (
    <Paper p="md" withBorder>
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs">
            <Badge>{review.targetType}</Badge>
            <Badge color={review.status === 'PENDING' ? 'yellow' : 'gray'}>{review.status}</Badge>
            <Badge variant="outline">{review.source}</Badge>
          </Group>
          <Text size="sm" c="dimmed" mt={6}>
            {review.reviewId}
          </Text>
          <Text size="sm" style={{ wordBreak: 'break-all' }}>
            Target: {review.targetId}
          </Text>
        </Box>
        <Group gap="xs">
          <TargetNavigation review={review} compact />
          <Button component={Link} to={`/admin/moderation/${review.reviewId}`} size="xs">
            Inspect
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}

function TargetNavigation({ review, compact = false }: { review?: Pick<ModerationReview, 'targetType' | 'targetId'>; compact?: boolean }) {
  if (!review) {
    return null;
  }

  if (review.targetType === 'NOVEL') {
    return (
      <Button component={Link} to={`/reader/novels/${review.targetId}`} size={compact ? 'xs' : 'sm'} variant="light">
        Open novel
      </Button>
    );
  }

  if (review.targetType === 'CHAPTER') {
    return (
      <Button component={Link} to={`/reader/chapters/${review.targetId}`} size={compact ? 'xs' : 'sm'} variant="light">
        Open chapter
      </Button>
    );
  }

  if (review.targetType === 'USER') {
    return (
      <Button component={Link} to={`/authors/${review.targetId}`} size={compact ? 'xs' : 'sm'} variant="light">
        Open user/author
      </Button>
    );
  }

  return (
    <Badge size={compact ? 'sm' : 'lg'} variant="outline">
      Comment target has no standalone reader route
    </Badge>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Paper p="md" withBorder>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={800}>
        {value}
      </Text>
    </Paper>
  );
}
