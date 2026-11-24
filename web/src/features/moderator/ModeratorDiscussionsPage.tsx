import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon, Anchor, Badge, Button, Card, Group, Loader, Modal, Pagination,
  SegmentedControl, Select, Stack, Table, Text, Textarea, Title, Tooltip
} from '@mantine/core';
import { useToast } from '../../shared/components/ToastProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconChevronDown, IconChevronRight, IconLock, IconPin, IconReportAnalytics, IconArrowMoveRight
} from '@tabler/icons-react';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import {
  listModeratorDiscussionCategories,
  listModeratorDiscussionTopicComments,
  listModeratorDiscussionTopics,
  moderateModeratorDiscussionComment,
  moderateModeratorDiscussionTopic,
  type ModeratorDiscussionComment,
  type ModeratorDiscussionTopic,
  type ModeratorDiscussionPage,
  type ModeratorTopicChange
} from './moderator-api';

const LIMIT = 20;
const STATUS_COLOR: Record<ModeratorDiscussionTopic['status'], string> = {
  VISIBLE: 'teal', HIDDEN: 'orange', DELETED: 'red'
};

type ReasonTarget =
  | { kind: 'topic'; topic: ModeratorDiscussionTopic; change: ModeratorTopicChange; label: string }
  | { kind: 'comment'; topic: ModeratorDiscussionTopic; comment: ModeratorDiscussionComment; status: 'VISIBLE' | 'HIDDEN' | 'DELETED'; label: string };

export function ModeratorDiscussionsPage() {
  const [status, setStatus] = useState<ModeratorDiscussionTopic['status']>('VISIBLE');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [commentPage, setCommentPage] = useState(1);
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<ModeratorDiscussionTopic | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const topicsQuery = useQuery({
    queryKey: ['moderator', 'discussions', 'topics', status, page],
    queryFn: async () => listModeratorDiscussionTopics({ status, page, limit: LIMIT })
  });
  const categoriesQuery = useQuery({
    queryKey: ['moderator', 'discussions', 'categories'],
    queryFn: async () => listModeratorDiscussionCategories()
  });
  const commentsQuery = useQuery({
    queryKey: ['moderator', 'discussions', 'comments', expanded, commentPage],
    enabled: Boolean(expanded),
    queryFn: async () => listModeratorDiscussionTopicComments(expanded!, { page: commentPage, limit: LIMIT })
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['moderator', 'discussions'] });
  }, [queryClient]);

  const moderationMutation = useMutation({
    mutationFn: async (input: { target: ReasonTarget; reason: string }) => {
      const { target, reason } = input;
      if (target.kind === 'comment') {
        return moderateModeratorDiscussionComment(
          target.topic.topicId, target.comment.commentId, target.status, reason
        );
      }
      return moderateModeratorDiscussionTopic(target.topic.topicId, target.change, reason);
    },
    onSuccess: () => {
      showToast('Đã ghi thao tác điều hành.', 'success');
      setReasonTarget(null);
      invalidate();
    },
    onError: error => showToast(getApiErrorMessage(error), 'error')
  });

  const moveOptions = (categoriesQuery.data ?? [])
    .filter(category => category.isActive && !category.postAdminOnly)
    .map(category => ({ value: category.categoryId, label: category.name }));

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={2}>
          <Title order={2}>Điều hành thảo luận</Title>
          <Text size="sm" c="dimmed">Ghim, khoá, ẩn hoặc chuyển chuyên mục của chủ đề và bình luận.</Text>
        </Stack>
        <Anchor href="/moderator/reviews" size="sm"><Group gap={4}><IconReportAnalytics size={16} />Hàng đợi báo cáo</Group></Anchor>
      </Group>

      <SegmentedControl
        value={status}
        onChange={(value) => { setStatus(value as ModeratorDiscussionTopic['status']); setPage(1); setExpanded(null); }}
        data={[{ label: 'Hiển thị', value: 'VISIBLE' }, { label: 'Đã ẩn', value: 'HIDDEN' }, { label: 'Đã xoá', value: 'DELETED' }]}
      />
      {topicsQuery.isPending ? <LoadingState variant="table" label="Đang tải chủ đề…" /> : null}
      {topicsQuery.isError ? <ErrorState error={topicsQuery.error} onRetry={() => void topicsQuery.refetch()} /> : null}
      {topicsQuery.data && topicsQuery.data.items.length === 0 ? (
        <EmptyState description="Không có chủ đề nào ở trạng thái này." />
      ) : null}
      {topicsQuery.data?.items.length ? (
        <Table.ScrollContainer minWidth={860}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 40 }} />
                <Table.Th>Chủ đề</Table.Th>
                <Table.Th>Danh mục</Table.Th>
                <Table.Th>Tác giả</Table.Th>
                <Table.Th>Trạng thái</Table.Th>
                <Table.Th style={{ width: 200 }}>Thao tác</Table.Th>
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
                            data-testid={`moderator-topic-comments-toggle-${topic.topicId}`}
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
                            <ActionIcon size="sm" variant="subtle" disabled={isDeleted}
                              aria-label={topic.isPinned ? 'Bỏ ghim' : 'Ghim'}
                              data-testid={`moderator-topic-pin-${topic.topicId}`}
                              onClick={() => setReasonTarget({
                                kind: 'topic', topic,
                                change: { field: 'isPinned', value: !topic.isPinned, expected: topic.isPinned },
                                label: `${topic.isPinned ? 'Bỏ ghim' : 'Ghim'}: ${topic.title}`
                              })}>
                              <IconPin size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={topic.isLocked ? 'Mở khoá' : 'Khoá'}>
                            <ActionIcon size="sm" variant="subtle" disabled={isDeleted}
                              aria-label={topic.isLocked ? 'Mở khoá' : 'Khoá'}
                              data-testid={`moderator-topic-lock-${topic.topicId}`}
                              onClick={() => setReasonTarget({
                                kind: 'topic', topic,
                                change: { field: 'isLocked', value: !topic.isLocked, expected: topic.isLocked },
                                label: `${topic.isLocked ? 'Mở khoá' : 'Khoá'}: ${topic.title}`
                              })}>
                              <IconLock size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Chuyển chuyên mục">
                            <ActionIcon size="sm" variant="subtle" disabled={isDeleted}
                              aria-label="Chuyển chuyên mục"
                              data-testid={`moderator-topic-move-${topic.topicId}`}
                              onClick={() => setMoveTarget(topic)}>
                              <IconArrowMoveRight size={15} />
                            </ActionIcon>
                          </Tooltip>
                          {isDeleted ? null : topic.status === 'VISIBLE' ? (
                            <Button size="compact-xs" color="orange" variant="subtle" data-testid={`moderator-topic-hide-${topic.topicId}`}
                              onClick={() => setReasonTarget({
                                kind: 'topic', topic,
                                change: { field: 'status', value: 'HIDDEN', expected: topic.status },
                                label: `Ẩn: ${topic.title}`
                              })}>Ẩn</Button>
                          ) : (
                            <Button size="compact-xs" color="teal" variant="subtle" data-testid={`moderator-topic-restore-${topic.topicId}`}
                              onClick={() => setReasonTarget({
                                kind: 'topic', topic,
                                change: { field: 'status', value: 'VISIBLE', expected: topic.status },
                                label: `Khôi phục: ${topic.title}`
                              })}>Khôi phục</Button>
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
                            disabled={isDeleted}
                            onPage={setCommentPage}
                            onModerate={(comment, nextStatus, action) => setReasonTarget({
                              kind: 'comment', topic, comment, status: nextStatus, label: action
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

      <MoveTopicModal
        topic={moveTarget}
        options={moveOptions}
        onClose={() => setMoveTarget(null)}
        onConfirm={(destinationCategoryId) => {
          if (!moveTarget) return;
          setReasonTarget({
            kind: 'topic',
            topic: moveTarget,
            change: { field: 'destinationCategoryId', value: destinationCategoryId, expected: moveTarget.categoryId },
            label: `Chuyển: ${moveTarget.title}`
          });
          setMoveTarget(null);
        }}
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

function CommentList({ query, page, disabled, onPage, onModerate }: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: ModeratorDiscussionPage<ModeratorDiscussionComment>; refetch: () => unknown };
  page: number;
  disabled: boolean;
  onPage: (page: number) => void;
  onModerate: (comment: ModeratorDiscussionComment, status: 'VISIBLE' | 'HIDDEN', action: string) => void;
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
                <Button size="compact-xs" color="orange" variant="subtle" disabled={disabled}
                  data-testid={`moderator-comment-hide-${comment.commentId}`}
                  onClick={() => onModerate(comment, 'HIDDEN', 'Ẩn bình luận')}>Ẩn</Button>
              ) : (
                <Button size="compact-xs" color="teal" variant="subtle" disabled={disabled}
                  data-testid={`moderator-comment-restore-${comment.commentId}`}
                  onClick={() => onModerate(comment, 'VISIBLE', 'Khôi phục bình luận')}>Khôi phục</Button>
              )}
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

function MoveTopicModal({ topic, options, onClose, onConfirm }: {
  topic: ModeratorDiscussionTopic | null;
  options: Array<{ value: string; label: string }>;
  onClose: () => void;
  onConfirm: (destinationCategoryId: string) => void;
}) {
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => { if (topic) setDestination(null); }, [topic]);
  return (
    <Modal opened={Boolean(topic)} onClose={onClose} title="Chuyển chuyên mục">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">Chủ đề: {topic?.title}</Text>
        <Select
          label="Chuyên mục đích"
          placeholder="Chọn chuyên mục"
          data={options.filter(option => option.value !== topic?.categoryId)}
          value={destination}
          onChange={setDestination}
          data-testid="moderator-move-destination"
          searchable
        />
        <Text size="xs" c="dimmed">Chuyên mục chính thức và đã đóng không thể là đích chuyển.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Huỷ</Button>
          <Button
            data-testid="moderator-move-confirm"
            disabled={!destination}
            onClick={() => destination && onConfirm(destination)}>
            Tiếp tục
          </Button>
        </Group>
      </Stack>
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
          label="Lý do" required minRows={3} maxLength={500} value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          error={reason.trim().length < 5 ? 'Lý do phải có ít nhất 5 ký tự.' : undefined}
          data-testid="moderator-reason-input"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={pending}>Huỷ</Button>
          <Button
            data-testid="moderator-reason-confirm"
            loading={pending} disabled={reason.trim().length < 5}
            onClick={() => onSubmit(reason.trim())}>
            Xác nhận
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
