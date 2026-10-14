import { Avatar, Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Switch, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { getAuthorProfile, getMyProfile, getMySettings, updateMyProfile, updateMySettings } from './profile-api';

export function MyProfilePage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile', 'me'], queryFn: getMyProfile });
  const settingsQuery = useQuery({ queryKey: ['settings', 'me'], queryFn: getMySettings });
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [language, setLanguage] = useState('vi');
  const [notificationEnabled, setNotificationEnabled] = useState(true);

  useEffect(() => {
    if (profileQuery.data) {
      setDisplayName(profileQuery.data.displayName ?? '');
      setAvatarUrl(profileQuery.data.avatarUrl ?? '');
      setBio(profileQuery.data.bio ?? '');
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (settingsQuery.data) {
      setLanguage(settingsQuery.data.language);
      setNotificationEnabled(settingsQuery.data.notificationEnabled);
    }
  }, [settingsQuery.data]);

  const profileMutation = useMutation({
    mutationFn: () =>
      updateMyProfile({
        displayName: displayName || undefined,
        avatarUrl: avatarUrl || null,
        bio: bio || null
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', 'me'] })
  });

  const settingsMutation = useMutation({
    mutationFn: () => updateMySettings({ language, notificationEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'me'] })
  });

  if (profileQuery.isLoading || settingsQuery.isLoading) return <LoadingState label="Loading profile..." />;
  if (profileQuery.isError) return <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />;
  if (settingsQuery.isError) return <ErrorState error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />;

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2}>My Profile</Title>
          <Text c="dimmed">Manage display profile and account-level settings.</Text>
        </Box>
        <Badge variant="light">{profileQuery.data?.role}</Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper p="md" withBorder>
          <Stack>
            <Group>
              <Avatar src={avatarUrl || null} size="lg" radius="xl" />
              <Box>
                <Text fw={700}>{profileQuery.data?.username}</Text>
                <Text size="sm" c="dimmed">
                  {profileQuery.data?.userId}
                </Text>
              </Box>
            </Group>
            <TextInput label="Display name" value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} />
            <TextInput label="Avatar URL" value={avatarUrl} onChange={(event) => setAvatarUrl(event.currentTarget.value)} />
            <Textarea label="Bio" value={bio} onChange={(event) => setBio(event.currentTarget.value)} minRows={5} />
            <Button loading={profileMutation.isPending} onClick={() => profileMutation.mutate()}>
              Save profile
            </Button>
          </Stack>
        </Paper>

        <Paper p="md" withBorder>
          <Stack>
            <Title order={4}>Settings</Title>
            <TextInput label="Language" value={language} onChange={(event) => setLanguage(event.currentTarget.value)} />
            <Switch
              label="Enable notifications"
              checked={notificationEnabled}
              onChange={(event) => setNotificationEnabled(event.currentTarget.checked)}
            />
            <Button variant="light" loading={settingsMutation.isPending} onClick={() => settingsMutation.mutate()}>
              Save settings
            </Button>
            {profileQuery.data?.role === 'AUTHOR' || profileQuery.data?.role === 'ADMIN' ? (
              <Button component={Link} to={`/authors/${profileQuery.data.userId}`} variant="subtle">
                View public author profile
              </Button>
            ) : null}
          </Stack>
        </Paper>
      </SimpleGrid>
    </Box>
  );
}

export function AuthorProfilePage() {
  const { authorId = '' } = useParams();
  const authorQuery = useQuery({
    queryKey: ['author-profile', authorId],
    queryFn: () => getAuthorProfile(authorId),
    enabled: Boolean(authorId)
  });

  if (authorQuery.isLoading) return <LoadingState label="Loading author profile..." />;
  if (authorQuery.isError) return <ErrorState error={authorQuery.error} onRetry={() => void authorQuery.refetch()} />;

  const author = authorQuery.data;

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Group>
          <Avatar src={author?.avatarUrl ?? null} size="xl" radius="xl" />
          <Box>
            <Title order={2}>{author?.displayName ?? author?.username ?? 'Author'}</Title>
            <Text c="dimmed">{author?.followersCount ?? 0} followers</Text>
          </Box>
        </Group>
        <Button component={Link} to="/reader" variant="light">
          Reader Home
        </Button>
      </Group>

      <Paper p="md" withBorder mb="md">
        <Text>{author?.bio ?? 'No public bio yet.'}</Text>
      </Paper>

      <Title order={3} mb="sm">
        Published Novels
      </Title>
      {!author?.novels.length ? <EmptyState description="This author has no published novels yet." /> : null}
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
        {(author?.novels ?? []).map((novel) => (
          <Paper key={novel.novelId} p="md" withBorder>
            <Stack gap="xs">
              <Group justify="space-between">
                <Title order={4}>{novel.title}</Title>
                <Badge>{novel.status}</Badge>
              </Group>
              <Group gap="xs">
                <Badge variant="outline">{novel.chaptersCount ?? 0} chapters</Badge>
                <Badge variant="outline">{novel.likesCount ?? 0} likes</Badge>
              </Group>
              <Button component={Link} to={`/reader/novels/${novel.novelId}`} size="xs">
                Open novel
              </Button>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Box>
  );
}
