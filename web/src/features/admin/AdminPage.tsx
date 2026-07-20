import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import {
  approveWithdrawRequest,
  createGenre,
  createTag,
  getDashboardStats,
  getTaxonomy,
  listAdminUsers,
  listModerationReviews,
  listWithdrawRequests,
  lockUser,
  rejectWithdrawRequest,
  resolveModerationReview,
  unlockUser
} from './admin-api';

export function AdminPage() {
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = useState('');
  const [taxonomyName, setTaxonomyName] = useState('');
  const statsQuery = useQuery({ queryKey: ['admin-stats'], queryFn: getDashboardStats });
  const usersQuery = useQuery({ queryKey: ['admin-users', userSearch], queryFn: () => listAdminUsers(userSearch) });
  const taxonomyQuery = useQuery({ queryKey: ['admin-taxonomy'], queryFn: getTaxonomy });
  const moderationQuery = useQuery({ queryKey: ['admin-moderation'], queryFn: listModerationReviews });
  const withdrawQuery = useQuery({ queryKey: ['admin-withdraw'], queryFn: () => listWithdrawRequests('PENDING') });

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

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>Admin Console</Title>
          <Text c="dimmed">Dashboard, users, taxonomy, moderation and withdraw review.</Text>
        </Box>
        <Badge variant="light">Admin API</Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        <StatCard label="Users" value={statsQuery.data?.totalUsers ?? 0} />
        <StatCard label="Novels" value={statsQuery.data?.totalNovels ?? 0} />
        <StatCard label="Pending moderation" value={statsQuery.data?.pendingModerationItems ?? 0} />
        <StatCard label="Mock revenue" value={statsQuery.data?.mockRevenueCoins ?? 0} />
      </SimpleGrid>

      <Tabs defaultValue="users">
        <Tabs.List>
          <Tabs.Tab value="users">Users</Tabs.Tab>
          <Tabs.Tab value="taxonomy">Taxonomy</Tabs.Tab>
          <Tabs.Tab value="moderation">Moderation</Tabs.Tab>
          <Tabs.Tab value="withdraw">Withdraw</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users" pt="md">
          <Paper p="md" withBorder>
            <TextInput label="Search users" value={userSearch} onChange={(event) => setUserSearch(event.currentTarget.value)} mb="md" />
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
                        <Button size="xs" variant="light" onClick={() => unlockMutation.mutate(user.userId)}>
                          Unlock
                        </Button>
                      ) : (
                        <Button size="xs" color="red" variant="light" onClick={() => lockMutation.mutate(user.userId)}>
                          Lock
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
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
                    <Button size="xs" onClick={() => resolveMutation.mutate({ reviewId: review.reviewId, decision: 'APPROVED' })}>
                      Approve
                    </Button>
                    <Button size="xs" color="red" variant="light" onClick={() => resolveMutation.mutate({ reviewId: review.reviewId, decision: 'REJECTED' })}>
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
                    <Button size="xs" onClick={() => approveWithdrawMutation.mutate(request.withdrawRequestId)}>
                      Approve
                    </Button>
                    <Button size="xs" color="red" variant="light" onClick={() => rejectWithdrawMutation.mutate(request.withdrawRequestId)}>
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
