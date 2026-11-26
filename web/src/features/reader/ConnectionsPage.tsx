import { profileHref } from '../../shared/routes';
import { Alert, Avatar, Button, Group, Pagination, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useResourceId } from '../../app/ResourceRoute';
import { useAuthStore } from '../auth/useAuthStore';
import { connections, followReader, readerProfile, type Connection } from './social-api';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getApiErrorMessage } from '../../shared/api/api-client';

function Person({ person }: { person: Connection }) {
  const account = useAuthStore(s => s.user?.userId);
  const client = useQueryClient();
  const follow = useMutation({ mutationFn: async () => {
    if (account !== useAuthStore.getState().user?.userId) throw new Error('Phiên đăng nhập đã thay đổi.');
    await followReader(person.userId, person.following);
  }, onSuccess: async () => { client.removeQueries({ queryKey: ['private-comments'] }); await client.invalidateQueries(); } });
  return <Paper withBorder p="md"><Group justify="space-between" wrap="wrap"><Group><Avatar src={person.avatarUrl} /><div><Link to={profileHref('member', person.userId, person.publicKey)}>{person.displayName || person.username}</Link><Text size="sm" c="dimmed">@{person.username}{person.mutual ? ' · Bạn bè' : ''}</Text></div></Group>
    {account && account !== person.userId && <Button variant={person.following ? 'default' : 'filled'} loading={follow.isPending} onClick={() => follow.mutate()}>{person.following ? 'Bỏ theo dõi' : person.followedBy ? 'Theo dõi lại' : 'Theo dõi'}</Button>}</Group>
    {person.bio && <Text mt="sm">{person.bio}</Text>}{person.followersCount != null && <Text size="sm" c="dimmed" mt="sm">{person.followersCount} người theo dõi · {person.followingCount} đang theo dõi</Text>}
    {follow.isError && <Alert color="red">{getApiErrorMessage(follow.error)}</Alert>}</Paper>;
}
export function ReaderProfilePage() {
  const userId = useResourceId('userId') ?? ''; const account = useAuthStore(s => s.user?.userId);
  const profile = useQuery({ queryKey: ['reader-profile', account, userId], queryFn: () => readerProfile(userId) });
  return <Stack><Title order={1}>Hồ sơ độc giả</Title>{profile.isPending && <LoadingState />}{profile.isError && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}{profile.data && <Person person={profile.data} />}</Stack>;
}
export function ConnectionsPage() {
  const account = useAuthStore(s => s.user?.userId); const [type, setType] = useState('SEARCH'); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['connections', account, type, q, page], queryFn: () => connections(type, q, page) });
  return <Stack><Title order={1}>Bạn bè</Title><Group grow><TextInput label="Tìm độc giả" value={q} onChange={e => { setQ(e.currentTarget.value); setPage(1); }} /><Select label="Danh sách" value={type} allowDeselect={false} data={[{ value: 'SEARCH', label: 'Tìm kiếm' }, { value: 'MUTUAL', label: 'Bạn bè' }, { value: 'FOLLOWING', label: 'Đang theo dõi' }, { value: 'FOLLOWERS', label: 'Người theo dõi' }]} onChange={v => { setType(v!); setPage(1); }} /></Group>
    {query.isPending && <LoadingState />}{query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}{!query.isError && query.data?.items.map(person => <Person key={person.userId} person={person} />)}{query.data?.items.length === 0 && <Text c="dimmed">Chưa có độc giả trong danh sách này.</Text>}{query.data && query.data.pages > 1 && <Pagination total={query.data.pages} value={page} onChange={setPage} />}</Stack>;
}
