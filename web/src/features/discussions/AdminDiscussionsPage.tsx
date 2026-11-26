import { navigationHref } from '../../shared/routes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Anchor, Badge, Button, Card, Group, Loader, Modal, Pagination, SegmentedControl,
  Stack, Switch, Table, Tabs, Text, Textarea, TextInput, Title, Tooltip
} from '@mantine/core';
import { useToast } from '../../shared/components/ToastProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconChevronDown, IconChevronRight, IconLock, IconPin,
  IconPlus, IconReportAnalytics
} from '@tabler/icons-react';
import { apiClient, getApiErrorMessage, type ApiEnvelope } from '../../shared/api/api-client';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

type Category = { categoryId: string; slug: string; name: string; sortOrder: number; isActive: boolean; postAdminOnly: boolean };
type TopicStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED';
type Topic = { topicId: string; title: string; status: TopicStatus; isPinned: boolean; isLocked: boolean; categoryName: string; authorName: string; createdAt: string };
type Comment = { commentId: string; body: string; status: TopicStatus; authorName: string; createdAt: string };
type Page<T> = { items: T[]; hasNext: boolean };

const LIMIT = 20;
const unwrap = <T,>(res: { data: ApiEnvelope<T> }) => res.data.data;
const STATUS_COLOR: Record<TopicStatus, string> = { VISIBLE: 'teal', HIDDEN: 'orange', DELETED: 'red' };

/** Reason is mandatory for every moderation and for retiring a category. */
type ReasonTarget = { kind: 'topic' | 'comment' | 'category'; id: string; commentId?: string; label: string; patch: Record<string, unknown> };

export function AdminDiscussionsPage() {
  const [tab, setTab] = useState<string | null>('topics');
  const [status, setStatus] = useState<TopicStatus>('VISIBLE');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [commentPage, setCommentPage] = useState(1);
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
  const [categoryForm, setCategoryForm] = useState<{ open: boolean; category: Category | null }>({ open: false, category: null });
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'discussions', 'categories'],
    queryFn: async () => unwrap(await apiClient.get<ApiEnvelope<Category[]>>('/admin/discussions/categories'))
  });
  const topicsQuery = useQuery({
    queryKey: ['admin', 'discussions', 'topics', status, page],
    queryFn: async () => unwrap(await apiClient.get<ApiEnvelope<Page<Topic>>>('/admin/discussions/topics', { params: { status, page, limit: LIMIT } }))
  });
  const commentsQuery = useQuery({
    queryKey: ['admin', 'discussions', 'comments', expanded, commentPage],
    enabled: Boolean(expanded),
    queryFn: async () => unwrap(await apiClient.get<ApiEnvelope<Page<Comment>>>(
      `/admin/discussions/topics/${expanded}/comments`, { params: { page: commentPage, limit: LIMIT } }))
  });

  const categories = useMemo(
    () => [...(categoriesQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [categoriesQuery.data]
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'discussions'] });
  }, [queryClient]);

  const categoriesMutation = useMutation({
    mutationFn: async (input: { category?: Category | null; values: Record<string, unknown> }) =>
      input.category
        ? unwrap(await apiClient.patch<ApiEnvelope<Category>>(`/admin/discussions/categories/${input.category.categoryId}`, input.values))
        : unwrap(await apiClient.post<ApiEnvelope<Category>>('/admin/discussions/categories', input.values)),
    onSuccess: () => { showToast('Đã lưu chuyên mục.', 'success'); setCategoryForm({ open: false, category: null }); invalidate(); },
    onError: error => showToast(getApiErrorMessage(error), 'error')
  });

  const moderationMutation = useMutation({
    mutationFn: async (input: { target: ReasonTarget; reason: string }) => {
      const { target, reason } = input;
      if (target.kind === 'category') {
        return unwrap(await apiClient.patch<ApiEnvelope<Category>>(
          `/admin/discussions/categories/${target.id}`, { ...target.patch, reason }));
      }
      if (target.kind === 'comment') {
        return unwrap(await apiClient.patch<ApiEnvelope<Comment>>(
          `/admin/discussions/${target.id}/comments/${target.commentId}/moderation`, { ...target.patch, reason }));
      }
      return unwrap(await apiClient.patch<ApiEnvelope<Topic>>(
        `/admin/discussions/${target.id}/moderation`, { ...target.patch, reason }));
    },
    onSuccess: () => { showToast('Đã cập nhật nội dung.', 'success'); setReasonTarget(null); invalidate(); },
    onError: error => showToast(getApiErrorMessage(error), 'error')
  });

  const askReason = (target: ReasonTarget) => setReasonTarget(target);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={2}>
          <Title order={2}>Thảo luận cộng đồng</Title>
          <Text size="sm" c="dimmed">Quản lý danh mục, chủ đề và bình luận.</Text>
        </Stack>
        <Anchor href={navigationHref("/admin/reports")} size="sm"><Group gap={4}><IconReportAnalytics size={16} />Hàng đợi báo cáo</Group></Anchor>
      </Group>

      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="topics">Chủ đề</Tabs.Tab>
          <Tabs.Tab value="categories">Danh mục</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="topics" pt="md">
          <Stack gap="md">
            <SegmentedControl
              value={status}
              onChange={(value) => { setStatus(value as TopicStatus); setPage(1); setExpanded(null); }}
              data={[{ label: 'Hiển thị', value: 'VISIBLE' }, { label: 'Đã ẩn', value: 'HIDDEN' }, { label: 'Đã xoá', value: 'DELETED' }]}
            />
            {topicsQuery.isPending ? <LoadingState variant="table" label="Đang tải chủ đề…" /> : null}
            {topicsQuery.isError ? <ErrorState error={topicsQuery.error} onRetry={() => void topicsQuery.refetch()} /> : null}
            {topicsQuery.data && topicsQuery.data.items.length === 0 ? (
              <EmptyState description={`Không có chủ đề nào ở trạng thái này. Hãy đổi bộ lọc hoặc chờ thành viên tạo mới.`} />
            ) : null}
            {topicsQuery.data?.items.length ? (
              <Table.ScrollContainer minWidth={760}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 40 }} />
                      <Table.Th>Chủ đề</Table.Th>
                      <Table.Th>Danh mục</Table.Th>
                      <Table.Th>Tác giả</Table.Th>
                      <Table.Th>Trạng thái</Table.Th>
                      <Table.Th style={{ width: 120 }}>Thao tác</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {topicsQuery.data.items.map((topic) => {
                      const isOpen = expanded === topic.topicId;
                      const isDeleted = topic.status === 'DELETED';
                      return (
                        <>
                        <Table.Tr key={topic.topicId}>
                          <Table.Td>
                            <Tooltip label={isOpen ? 'Thu gọn bình luận' : 'Xem bình luận'}>
                              <ActionIcon
                                variant="subtle"
                                aria-label={isOpen ? 'Thu gọn bình luận' : 'Xem bình luận'}
                                onClick={() => { setExpanded(isOpen ? null : topic.topicId); setCommentPage(1); }}
                              >
                                {isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                              </ActionIcon>
                            </Tooltip>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={6}>
                              {topic.isPinned ? <IconPin size={14} aria-label="Đã ghim" /> : null}
                              {topic.isLocked ? <IconLock size={14} aria-label="Đã khoá" /> : null}
                              <Text size="sm" lineClamp={1}>{topic.title}</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td><Text size="sm">{topic.categoryName}</Text></Table.Td>
                          <Table.Td><Text size="sm">{topic.authorName}</Text></Table.Td>
                          <Table.Td><Badge color={STATUS_COLOR[topic.status]} variant="light">{topic.status}</Badge></Table.Td>
                          <Table.Td>
                            <Group gap={4}>
                              <Tooltip label={topic.isPinned ? 'Bỏ ghim' : 'Ghim'}>
                                <ActionIcon size="sm" variant="subtle" disabled={isDeleted} aria-label={topic.isPinned ? 'Bỏ ghim' : 'Ghim'}
                                  onClick={() => askReason({ kind: 'topic', id: topic.topicId, label: topic.title, patch: { isPinned: !topic.isPinned } })}>
                                  <IconPin size={15} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label={topic.isLocked ? 'Mở khoá' : 'Khoá'}>
                                <ActionIcon size="sm" variant="subtle" disabled={isDeleted} aria-label={topic.isLocked ? 'Mở khoá' : 'Khoá'}
                                  onClick={() => askReason({ kind: 'topic', id: topic.topicId, label: topic.title, patch: { isLocked: !topic.isLocked } })}>
                                  <IconLock size={15} />
                                </ActionIcon>
                              </Tooltip>
                              {isDeleted ? null : topic.status === 'VISIBLE' ? (
                                <Button size="compact-xs" color="orange" variant="subtle"
                                  onClick={() => askReason({ kind: 'topic', id: topic.topicId, label: topic.title, patch: { status: 'HIDDEN' } })}>Ẩn</Button>
                              ) : (
                                <Button size="compact-xs" color="teal" variant="subtle"
                                  onClick={() => askReason({ kind: 'topic', id: topic.topicId, label: topic.title, patch: { status: 'VISIBLE' } })}>Khôi phục</Button>
                              )}
                              {isDeleted ? null : (
                                <Button size="compact-xs" color="red" variant="subtle"
                                  onClick={() => askReason({ kind: 'topic', id: topic.topicId, label: topic.title, patch: { status: 'DELETED' } })}>Xoá</Button>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                        {isOpen ? (
                          <Table.Tr key={`${topic.topicId}-comments`}>
                            <Table.Td colSpan={6}>
                              <CommentList
                                query={commentsQuery}
                                page={commentPage}
                                deletable={!isDeleted && status !== 'DELETED'}
                                onPage={setCommentPage}
                                onModerate={(comment, patch, action) => askReason({
                                  kind: 'comment', id: topic.topicId, commentId: comment.commentId, label: action, patch
                                })}
                              />
                            </Table.Td>
                          </Table.Tr>
                        ) : null}
                        </>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : null}
            {topicsQuery.data?.hasNext || page > 1 ? (
              <Pagination total={topicsQuery.data?.hasNext ? page + 1 : page} value={page} onChange={setPage} size="sm" />
            ) : null}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="categories" pt="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Thứ tự sắp xếp áp dụng cho cửa hàng thảo luận.</Text>
              <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => setCategoryForm({ open: true, category: null })}>Thêm danh mục</Button>
            </Group>
            {categoriesQuery.isPending ? <LoadingState variant="cards" label="Đang tải danh mục…" /> : null}
            {categoriesQuery.isError ? <ErrorState error={categoriesQuery.error} onRetry={() => void categoriesQuery.refetch()} /> : null}
            {categoriesQuery.data && categories.length === 0 ? (
              <EmptyState description="Chưa có danh mục thảo luận nào. Hãy tạo danh mục đầu tiên." />
            ) : null}
            {categories.map((category, index) => {
              const busy = categoriesMutation.isPending;
              return (
                <Card key={category.categoryId} withBorder p="md">
                  <Group justify="space-between" wrap="wrap">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text fw={600}>{category.name}</Text>
                        <Badge variant="light">{category.slug}</Badge>
                        <Badge color={category.isActive ? 'teal' : 'gray'} variant="light">{category.isActive ? 'Đang mở' : 'Đã đóng'}</Badge>
                        {category.postAdminOnly ? <Badge color="violet" variant="light">Chỉ quản trị đăng</Badge> : null}
                      </Group>
                      <Text size="xs" c="dimmed">Thứ tự {category.sortOrder}</Text>
                    </Stack>
                    <Group gap={4}>
                      <Button size="compact-xs" variant="light" disabled={busy} onClick={() => setCategoryForm({ open: true, category })}>Sửa</Button>
                      {['thao-luan-truyen', 'gop-y-tac-pham'].includes(category.slug) ? null : category.isActive ? (
                        <Button size="compact-xs" color="red" variant="light" disabled={busy}
                          onClick={() => askReason({ kind: 'category', id: category.categoryId, label: category.name, patch: { isActive: false } })}>Ngừng dùng</Button>
                      ) : (
                        <Button size="compact-xs" color="teal" variant="light" disabled={busy}
                          onClick={() => askReason({ kind: 'category', id: category.categoryId, label: category.name, patch: { isActive: true } })}>Kích hoạt</Button>
                      )}
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <CategoryModal
        open={categoryForm.open}
        category={categoryForm.category}
        pending={categoriesMutation.isPending}
        onClose={() => setCategoryForm({ open: false, category: null })}
        onSubmit={(values) => categoriesMutation.mutate({ category: categoryForm.category, values })}
      />

      <ReasonModal
        target={reasonTarget}
        pending={moderationMutation.isPending}
        onClose={() => setReasonTarget(null)}
        onSubmit={(reason) => reasonTarget && moderationMutation.mutate({ target: reasonTarget, reason })}
      />
    </Stack>
  );
}

function CommentList({ query, page, deletable, onPage, onModerate }: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: Page<Comment>; refetch: () => unknown };
  page: number;
  deletable: boolean;
  onPage: (page: number) => void;
  onModerate: (comment: Comment, patch: Record<string, unknown>, action: string) => void;
}) {
  if (query.isPending) return <Group gap="xs" p="sm"><Loader size="xs" /><Text size="sm" c="dimmed">Đang tải bình luận…</Text></Group>;
  if (query.isError) return <ErrorState title="Không thể tải bình luận" error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data?.items.length) return <Text size="sm" c="dimmed" p="sm">Chủ đề này chưa có bình luận nào.</Text>;
  return (
    <Stack gap="xs" p="sm">
      {query.data.items.map((comment) => {
        const deleted = comment.status === 'DELETED';
        return (
          <Group key={comment.commentId} justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={2}>
              <Group gap="xs">
                <Text size="sm" fw={500}>{comment.authorName}</Text>
                <Badge size="xs" color={STATUS_COLOR[comment.status]} variant="light">{comment.status}</Badge>
              </Group>
              <Text size="sm" lineClamp={3}>{comment.body}</Text>
            </Stack>
            <Group gap={4} wrap="nowrap">
              {deleted ? <Text size="xs" c="dimmed">Đã xoá</Text> : comment.status === 'VISIBLE' ? (
                <Button size="compact-xs" color="orange" variant="subtle"
                  onClick={() => onModerate(comment, { status: 'HIDDEN' }, 'Ẩn bình luận')}>Ẩn</Button>
              ) : (
                <Button size="compact-xs" color="teal" variant="subtle"
                  onClick={() => onModerate(comment, { status: 'VISIBLE' }, 'Khôi phục bình luận')}>Khôi phục</Button>
              )}
              {deletable && !deleted ? (
                <Button size="compact-xs" color="red" variant="subtle"
                  onClick={() => onModerate(comment, { status: 'DELETED' }, 'Xoá bình luận')}>Xoá</Button>
              ) : null}
            </Group>
          </Group>
        );
      })}
      {query.data.hasNext || page > 1 ? (
        <Pagination total={query.data.hasNext ? page + 1 : page} value={page} onChange={onPage} size="xs" />
      ) : null}
    </Stack>
  );
}

function CategoryModal({ open, category, pending, onClose, onSubmit }: {
  open: boolean;
  category: Category | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [postAdminOnly, setPostAdminOnly] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setSortOrder(String(category?.sortOrder ?? 0));
    setPostAdminOnly(category?.postAdminOnly ?? false);
    setReason('');
  }, [open, category]);

  const slug = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <Modal opened={open} onClose={onClose} title={category ? 'Sửa danh mục' : 'Thêm danh mục'}>
      <form onSubmit={event => {
        event.preventDefault();
        onSubmit({ name: name.trim(), sortOrder: Number(sortOrder), postAdminOnly, ...(category ? { reason: reason.trim() } : { slug }) });
      }}>
        <Stack gap="sm">
          <TextInput label="Tên danh mục" required maxLength={120} value={name} onChange={event => setName(event.currentTarget.value)} />
          {!category ? <Text size="xs" c="dimmed">Đường dẫn: {slug || '—'}</Text> : null}
          <TextInput label="Thứ tự" type="number" min={0} max={100000} step={1} value={sortOrder} onChange={event => setSortOrder(event.currentTarget.value)} />
          <Switch label="Chỉ quản trị viên được đăng" checked={postAdminOnly} disabled={category?.slug === 'thong-bao-cong-dong'} onChange={event => setPostAdminOnly(event.currentTarget.checked)} />
          {category && <Textarea label="Lý do sửa" required maxLength={500} value={reason} onChange={event => setReason(event.currentTarget.value)} />}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={pending}>Huỷ</Button>
            <Button type="submit" loading={pending} disabled={name.trim().length < 2 || (category ? !reason.trim() : !slug)}>Lưu</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ReasonModal({ target, pending, onClose, onSubmit }: {
  target: ReasonTarget | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (target) setReason(''); }, [target]);

  return (
    <Modal opened={Boolean(target)} onClose={onClose} title="Lý do thao tác">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">Nội dung: {target?.label}</Text>
        <Textarea
          label="Lý do" required minRows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.currentTarget.value)}
          error={reason.trim().length < 5 ? 'Lý do phải có ít nhất 5 ký tự.' : undefined}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={pending}>Huỷ</Button>
          <Button color="red" loading={pending} disabled={reason.trim().length < 5} onClick={() => onSubmit(reason.trim())}>Xác nhận</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
