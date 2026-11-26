import { navigationHref } from '../../shared/routes';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Badge, Button, Card, Group, Loader, Menu, Modal, Pagination, Select,
  Stack, Switch, Tabs, Text, Textarea, TextInput, Tooltip
} from '@mantine/core';
import { Link } from 'react-router-dom';
import { AdminConfirm, AdminHeader, AdminPagination, AdminPanel, AdminRowMenu, type PageMeta } from '../admin/AdminShared';
import { ResponsiveFilters } from '../../shared/components/InteractionWidgets';
import { useUrlFilters, WorkspaceTable, WorkspaceTableDetail, WorkspaceTableOptions } from '../../shared/components/WorkspacePreferences';
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
const STATUS_LABEL: Record<TopicStatus, string> = { VISIBLE: 'Đang hiển thị', HIDDEN: 'Đã ẩn', DELETED: 'Đã xóa' };
const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))
];
const TOPIC_COLUMNS = ['Chủ đề', 'Danh mục', 'Tác giả', 'Trạng thái', 'Thao tác'];

/** Reason is mandatory for every moderation and for retiring a category. */
type ReasonTarget = { kind: 'topic' | 'comment' | 'category'; id: string; commentId?: string; label: string; action: string; patch: Record<string, unknown> };

export function AdminDiscussionsPage() {
  const [tab, setTab] = useState<string | null>('topics');
  const { values: { q, status, page }, update } = useUrlFilters(
    { q: '', status: 'VISIBLE', page: 1 },
    { status: STATUS_OPTIONS.map((option) => option.value) }
  );
  const filterKey = JSON.stringify([q, status, page]);
  const [expandedTopic, setExpandedTopic] = useState<{ id: string; filterKey: string } | null>(null);
  const expanded = expandedTopic?.filterKey === filterKey ? expandedTopic.id : null;
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
    queryKey: ['admin', 'discussions', 'topics', q.trim(), status, page],
    queryFn: async ({ signal }) => unwrap(await apiClient.get<ApiEnvelope<Page<Topic> & { meta: PageMeta }>>(
      '/admin/discussions/topics', { params: { q: q.trim(), status: status || undefined, page, limit: LIMIT }, signal }
    ))
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
      <AdminHeader
        title="Thảo luận cộng đồng"
        description="Quản lý danh mục, chủ đề và bình luận."
        refresh={() => {
          if (tab === 'categories') void categoriesQuery.refetch();
          else {
            void topicsQuery.refetch();
            if (expanded) void commentsQuery.refetch();
          }
        }}
      >
        <Button component={Link} to={navigationHref('/admin/reports')} variant="subtle" leftSection={<IconReportAnalytics size={16} />}>
          Hàng đợi báo cáo
        </Button>
      </AdminHeader>

      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="topics">Chủ đề</Tabs.Tab>
          <Tabs.Tab value="categories">Danh mục</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="topics" pt="md">
          <AdminPanel>
            <ResponsiveFilters className="admin-toolbar">
              <TextInput
                className="admin-search"
                label="Tìm kiếm"
                placeholder="Tiêu đề chủ đề"
                maxLength={500}
                value={q}
                onChange={(event) => update({ q: event.currentTarget.value, page: 1 })}
              />
              <Select
                comboboxProps={{ withinPortal: false }}
                label="Trạng thái"
                allowDeselect={false}
                data={STATUS_OPTIONS}
                value={status}
                onChange={(value) => update({ status: value ?? '', page: 1 })}
              />
              <Button variant="subtle" onClick={() => update({ q: '', status: 'VISIBLE', page: 1 })}>
                Đặt lại
              </Button>
            </ResponsiveFilters>
            <WorkspaceTableOptions name="admindiscussions" columns={TOPIC_COLUMNS}
              presets={{ name: 'AdminDiscussionsPage', fields: ['q', 'status'] }}>
              {topicsQuery.isPending && <LoadingState variant="table" label="Đang tải chủ đề…" />}
              {topicsQuery.isError && <ErrorState error={topicsQuery.error} onRetry={() => void topicsQuery.refetch()} />}
              {topicsQuery.data?.items.length === 0 && <EmptyState description="Không tìm thấy chủ đề phù hợp." />}
              {!!topicsQuery.data?.items.length && (
                <WorkspaceTable>
                  <table className="admin-compact-table">
                    <thead><tr>{TOPIC_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>
                      {topicsQuery.data.items.map((topic) => {
                        const isOpen = expanded === topic.topicId;
                        const isDeleted = topic.status === 'DELETED';
                        const moderate = (action: string, patch: Record<string, unknown>) =>
                          askReason({ kind: 'topic', id: topic.topicId, label: topic.title, action, patch });
                        return (
                          <Fragment key={topic.topicId}>
                            <tr>
                              <td className="admin-table-title">
                                <Group gap={8} wrap="nowrap">
                                  <Tooltip label={isOpen ? 'Thu gọn bình luận' : 'Xem bình luận'}>
                                    <ActionIcon variant="subtle" aria-label={isOpen ? 'Thu gọn bình luận' : 'Xem bình luận'}
                                      aria-expanded={isOpen}
                                      onClick={() => {
                                        setExpandedTopic(isOpen ? null : { id: topic.topicId, filterKey });
                                        setCommentPage(1);
                                      }}>
                                      {isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                                    </ActionIcon>
                                  </Tooltip>
                                  {topic.isPinned && <IconPin size={14} aria-label="Đã ghim" />}
                                  {topic.isLocked && <IconLock size={14} aria-label="Đã khóa" />}
                                  <strong>{topic.title}</strong>
                                </Group>
                              </td>
                              <td>{topic.categoryName}</td>
                              <td>{topic.authorName}</td>
                              <td><Badge color={STATUS_COLOR[topic.status]} variant="light">{STATUS_LABEL[topic.status]}</Badge></td>
                              <td>
                                {!isDeleted && (
                                  <AdminRowMenu label={`Thao tác với ${topic.title}`}>
                                    <Menu.Item onClick={() => moderate(topic.isPinned ? 'Bỏ ghim chủ đề' : 'Ghim chủ đề', { isPinned: !topic.isPinned })}>
                                      {topic.isPinned ? 'Bỏ ghim' : 'Ghim'}
                                    </Menu.Item>
                                    <Menu.Item color={topic.isLocked ? undefined : 'red'}
                                      onClick={() => moderate(topic.isLocked ? 'Mở khóa chủ đề' : 'Khóa chủ đề', { isLocked: !topic.isLocked })}>
                                      {topic.isLocked ? 'Mở khóa' : 'Khóa'}
                                    </Menu.Item>
                                    {topic.status === 'VISIBLE' ? (
                                      <Menu.Item color="red" onClick={() => moderate('Ẩn chủ đề', { status: 'HIDDEN' })}>Ẩn</Menu.Item>
                                    ) : (
                                      <Menu.Item onClick={() => moderate('Khôi phục chủ đề', { status: 'VISIBLE' })}>Khôi phục</Menu.Item>
                                    )}
                                    <Menu.Item color="red" onClick={() => moderate('Xóa chủ đề', { status: 'DELETED' })}>Xóa</Menu.Item>
                                  </AdminRowMenu>
                                )}
                              </td>
                            </tr>
                            {isOpen && (
                              <WorkspaceTableDetail>
                                <CommentList
                                  query={commentsQuery}
                                  page={commentPage}
                                  deletable={!isDeleted}
                                  onPage={setCommentPage}
                                  onModerate={(comment, patch, action) => askReason({
                                    kind: 'comment', id: topic.topicId, commentId: comment.commentId, label: comment.authorName, action, patch
                                  })}
                                />
                              </WorkspaceTableDetail>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </WorkspaceTable>
              )}
              <AdminPagination meta={topicsQuery.data?.meta} onChange={(page) => update({ page })} />
            </WorkspaceTableOptions>
          </AdminPanel>
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
            {categories.map((category) => {
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
                          onClick={() => askReason({ kind: 'category', id: category.categoryId, label: category.name, action: 'Ngừng dùng danh mục', patch: { isActive: false } })}>Ngừng dùng</Button>
                      ) : (
                        <Button size="compact-xs" color="teal" variant="light" disabled={busy}
                          onClick={() => askReason({ kind: 'category', id: category.categoryId, label: category.name, action: 'Kích hoạt danh mục', patch: { isActive: true } })}>Kích hoạt</Button>
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
                <Badge size="xs" color={STATUS_COLOR[comment.status]} variant="light">{STATUS_LABEL[comment.status] ?? comment.status}</Badge>
              </Group>
              <Text size="sm" lineClamp={3}>{comment.body}</Text>
            </Stack>
            <Group gap={4} wrap="nowrap">
              {deleted ? <Text size="xs" c="dimmed">Đã xóa</Text> : comment.status === 'VISIBLE' ? (
                <Button size="compact-xs" color="orange" variant="subtle"
                  onClick={() => onModerate(comment, { status: 'HIDDEN' }, 'Ẩn bình luận')}>Ẩn</Button>
              ) : (
                <Button size="compact-xs" color="teal" variant="subtle"
                  onClick={() => onModerate(comment, { status: 'VISIBLE' }, 'Khôi phục bình luận')}>Khôi phục</Button>
              )}
              {deletable && !deleted ? (
                <Button size="compact-xs" color="red" variant="subtle"
                  onClick={() => onModerate(comment, { status: 'DELETED' }, 'Xóa bình luận')}>Xóa</Button>
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

  const destructive = target?.patch.status === 'DELETED' || target?.patch.status === 'HIDDEN'
    || target?.patch.isLocked === true || target?.patch.isActive === false;
  return (
    <AdminConfirm
      opened={Boolean(target)}
      title={target?.action ?? 'Xác nhận thao tác'}
      destructive={destructive}
      confirmLabel="Xác nhận"
      reason={reason}
      setReason={setReason}
      reasonMaxLength={500}
      required
      disabled={reason.trim().length < 5}
      pending={pending}
      onClose={onClose}
      onConfirm={() => onSubmit(reason.trim())}
    >
      <p>{target?.label}</p>
    </AdminConfirm>
  );
}
