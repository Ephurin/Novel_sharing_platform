import { baselineActivationBlockedMessage } from '../manuscript-import/manuscript-import-api';
import { notifyMemoryChanged } from './memory-events';
import type {PlanningStep} from './PlanningStudio';
import {StoryPlanEditor} from './StoryPlanEditor';
import { useAuthStore } from '../auth/useAuthStore';
import { SetupFoundationPanel } from './SetupFoundationPanel';
import { useEffect, useMemo, useState } from 'react';
import { EntityProfileEditor } from './EntityProfileEditor';
import { EntityExtractionReview } from './EntityExtractionReview';
import { AuthorRelationshipLocks } from './AuthorRelationshipLocks';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  Drawer,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconEdit, IconLock, IconRefresh, IconRotate, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage, ApiClientError } from '../../shared/api/api-client';
import { getChapter, listChapters } from '../novels/novel-api';
import { createChapterSnapshot, listChapterRevisions } from './ai-copilot-api';
import { AuthorMemoryRepair } from './AuthorMemoryRepair';
import {
  activateBaseline,
  getBootstrapJob,
  getReviewQueue,
  getStoryBrainSummary,
  rejectProposal,
  resumeBootstrapJob,
  startManuscriptBootstrap,
  type ReviewProposal
} from '../manuscript-import/manuscript-import-api';
import {
  getApprovedMemory,
  memoryGet,
  memoryPost,
  reanalyseSavedChapter,
  runAuthorOperation,
  saveFuturePlan,
  acceptProposalGroupAtomic,
  rejectProposalGroupAtomic,
  type RejectGroupPayload,
  correctMemoryEvent,
  normalizeEntityName,
  entityNameEditError,
  type AutoRun,
  type AuthorPlan,
  type ConsistencyFinding,
  type FutureEvent,
  type MemoryEvent,
  type MemoryEntity,
  type MemoryFact,
  type Relationship,
  type Transition,
  type EventCorrection,
  type GroupApproval
} from './author-memory-api';

export function AuthorMemoryPanel(props: {
  novelId: string; chapterId: string; content: string; opened: boolean; onClose: () => void; saved: boolean; onOpenPlanning?:(step:PlanningStep)=>void; allowOfflineSetupTest?:boolean; initialTab?:string;
}) {
  const account = useAuthStore(state => state.user?.userId ?? 'guest');
  return <ScopedAuthorMemoryPanel key={JSON.stringify([account, props.novelId])} {...props} accountScope={account}/>;
}

function ScopedAuthorMemoryPanel({
  novelId,
  chapterId,
  content,
  opened,
  onClose,
  saved,
  accountScope,
  onOpenPlanning,
  allowOfflineSetupTest,
  initialTab
}: {
  novelId: string;
  chapterId: string;
  content: string;
  opened: boolean;
  onClose: () => void;
  saved: boolean;
  accountScope: string;
  onOpenPlanning?:(step:PlanningStep)=>void; allowOfflineSetupTest?:boolean; initialTab?:string;
}) {
  const qc = useQueryClient();
  const [profileTabOpened, setProfileTabOpened] = useState(false);
  // #133: callers (e.g. Planning Studio) can open the drawer on a specific tab.
  const [tab, setTab] = useState<string>(initialTab ?? 'review');
  useEffect(() => {
    if (opened) {
      setTab(initialTab ?? 'review');
      setProfileTabOpened(initialTab === 'profiles');
    }
  }, [opened, initialTab]);
  const [direction, setDirection] = useState('');
  const [events, setEvents] = useState<FutureEvent[]>([]);
  const [findings, setFindings] = useState<ConsistencyFinding[] | null>(null);
  const [ruleCheck, setRuleCheck] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'error' | 'success'>('info');

  // Track explicit author edits to proposals in review queue: { [proposal_id]: replacement_payload }
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});

  // Group rejection confirmation state (FE-07)
  const [confirmRejectGroup, setConfirmRejectGroup] = useState<{ groupId: string; count: number } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const storageKey = `ephurin-bootstrap-${novelId}`;
  const [jobId, setJobId] = useState<string | null>(() => localStorage.getItem(storageKey));

  // Reset local state on novel change for cross-novel state isolation
  useEffect(() => {
    setJobId(localStorage.getItem(storageKey));
    setEvents([]);
    setFindings(null);
    setEdits({});
    setMessage('');
    setConfirmRejectGroup(null);
    setRejectReason('');
  }, [novelId, storageKey]);

  const enabled = opened && Boolean(novelId);

  const brain = useQuery({
    queryKey: ['story-brain-summary', novelId, accountScope],
    queryFn: () => getStoryBrainSummary(novelId),
    enabled,
    refetchInterval: enabled ? 3000 : false
  });

  const memory = useQuery({
    queryKey: ['approved-memory', novelId, accountScope],
    queryFn: () => getApprovedMemory(novelId),
    enabled,
    refetchInterval: enabled ? 3000 : false
  });

  const queue = useQuery({
    queryKey: ['memory-review', novelId, accountScope],
    queryFn: () => getReviewQueue(novelId),
    enabled,
    refetchInterval: enabled ? 3000 : false
  });

  const extraction = useQuery({
    queryKey: ['memory-extraction', novelId, accountScope],
    enabled,
    refetchInterval: enabled ? 3000 : false,
    queryFn: () =>
      memoryGet<{ chapter_id: string; chapter_number: number; status: string | null; retry_count: number }[]>(
        `/ai/story-brains/${novelId}/extraction-status`
      )
  });

  const job = useQuery({
    queryKey: ['memory-job', jobId, accountScope],
    queryFn: () => getBootstrapJob(jobId!),
    enabled: enabled && Boolean(jobId),
    refetchInterval: q => (['queued', 'running'].includes(q.state.data?.status ?? '') ? 1500 : false)
  });

  const plan = useQuery({
    queryKey: ['author-plan', novelId, accountScope],
    queryFn: async () => {
      try {
        return await memoryGet<AuthorPlan>(`/ai/story-plans/by-novel/${novelId}/active`);
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 404) return null;
        throw e;
      }
    },
    enabled
  });

  const auto = useQuery({
    queryKey: ['author-auto', novelId, accountScope],
    queryFn: async () => {
      try {
        const lastRun = localStorage.getItem(`ephurin-auto-${novelId}`);
        return await memoryGet<AutoRun>(
          lastRun ? `/ai/autonomous/runs/${lastRun}` : `/ai/autonomous/by-novel/${novelId}/active`
        );
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 404) return null;
        throw e;
      }
    },
    enabled,
    refetchInterval: enabled ? 3000 : false
  });

  useEffect(() => {
    if (!auto.data) return;
    void qc.invalidateQueries({ queryKey: ['author', 'chapters', novelId] });
    void qc.invalidateQueries({ queryKey: ['author', 'chapter', chapterId] });
  }, [auto.data?.current_iteration, auto.data?.status, novelId, chapterId, qc]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['approved-memory', novelId] }),
      qc.invalidateQueries({ queryKey: ['story-brain-summary', novelId] }),
      qc.invalidateQueries({ queryKey: ['memory-review', novelId] }),
      qc.invalidateQueries({ queryKey: ['author-plan', novelId] }),
      qc.invalidateQueries({ queryKey: ['author-auto', novelId] })
    ]);
    notifyMemoryChanged(novelId);
  };

  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: e => {
      setMessageType('error');
      const blocked = baselineActivationBlockedMessage(e);
      if (blocked) {
        setMessage(blocked);
        return;
      }
      if (e instanceof ApiClientError) {
        if (e.status === 409) {
          setMessage(
            'Xung đột phiên bản bộ nhớ (409 Conflict). Dữ liệu đã thay đổi trên máy chủ; các chỉnh sửa của bạn được bảo lưu.'
          );
        } else if (e.status === 422) {
          setMessage(`Dữ liệu không hợp lệ (422): ${getApiErrorMessage(e)}. Các chỉnh sửa của bạn được bảo lưu.`);
        } else {
          setMessage(getApiErrorMessage(e));
        }
      } else {
        setMessage(getApiErrorMessage(e));
      }
    }
  });

  const perform = (fn: () => Promise<unknown>) => {
    setMessage('');
    action.mutate(fn);
  };

  const rememberJob = (id: string) => {
    localStorage.setItem(storageKey, id);
    setJobId(id);
  };

  const bootstrap = async () => {
    if (!saved) throw new Error('Hãy đợi lưu bản nháp trước khi trích xuất.');
    const chapters = await listChapters(novelId);
    const revisions = [];
    for (const ch of chapters) {
      const detail = await getChapter(ch.chapterId);
      const body = detail.draft?.content ?? detail.content ?? '';
      if (!body.trim()) continue;
      const rev = await memoryPost<{ revisionId: string; contentHash: string }>(
        `/chapters/${ch.chapterId}/revisions/snapshot`,
        { content: body, purpose: 'MANUSCRIPT_BOOTSTRAP' }
      );
      revisions.push({ chapter_id: ch.chapterId, revision_id: rev.revisionId, content_hash: rev.contentHash });
    }
    if (!revisions.length) throw new Error('Chưa có nội dung chương để trích xuất.');
    const result = await startManuscriptBootstrap(novelId, revisions);
    rememberJob(result.job_id);
  };

  const check = async () => {
    if (!saved) throw new Error('Hãy lưu nội dung trước khi kiểm tra.');
    const revisions = await listChapterRevisions(chapterId);
    let revision = revisions[0];
    if (!revision || revision.content !== content) {
      revision = await createChapterSnapshot(chapterId, content);
    }
    const result = await runAuthorOperation<{ findings: ConsistencyFinding[]; rule_check?: string }>(novelId, {
      operation: 'check_consistency',
      content,
      revision_id: revision.revisionId,
      chapter_id: chapterId,
      content_hash: revision.contentHash
    });
    setFindings(result.findings);
    setRuleCheck(result.rule_check ?? null);
  };

  // Event correction submission (B4, FE-01, FE-06)
  const handleEventCorrection = async (event: MemoryEvent, correction: EventCorrection) => {
    try {
      await correctMemoryEvent(novelId, event.event_id, correction);
      setMessageType('success');
      setMessage(
        'Đã gửi đề xuất cập nhật sự kiện thành công (HTTP 201). Đề xuất đang ở trạng thái CHỜ DUYỆT; hãy chuyển sang tab "Chờ duyệt" để kiểm tra và chấp thuận vào Canon.'
      );
      await qc.invalidateQueries({ queryKey: ['memory-review', novelId] });
    } catch (err) {
      setMessageType('error');
      if (err instanceof ApiClientError) {
        if (err.status === 409) {
          setMessage(
            'Xung đột phiên bản bộ nhớ (409 Conflict). Dữ liệu đã thay đổi trên máy chủ; các chỉnh sửa của bạn được bảo lưu.'
          );
        } else if (err.status === 422) {
          setMessage(`Dữ liệu không hợp lệ (422): ${getApiErrorMessage(err)}. Các chỉnh sửa của bạn được bảo lưu.`);
        } else {
          setMessage(getApiErrorMessage(err));
        }
      } else {
        setMessage(getApiErrorMessage(err));
      }
      throw err;
    }
  };

  // Group acceptance submission (B5 & C-01)
  const handleAcceptGroup = (groupId: string, proposals: ReviewProposal[]) => {
    perform(async () => {
      for (const proposal of proposals) {
        const edited = edits[proposal.proposal_id];
        if (proposal.proposal_type === 'entity' && edited) {
          const name = String(edited.canonical_name ?? '');
          const error = entityNameEditError(name);
          if (error) throw new Error(error);
          if (edited.normalized_name !== normalizeEntityName(name)) {
            throw new Error('Tên thực thể và tên chuẩn hóa không khớp.');
          }
        }
      }
      const edited_payloads = Object.fromEntries(
        proposals
          .filter(p => edits[p.proposal_id] !== undefined)
          .map(p => [p.proposal_id, edits[p.proposal_id]])
      );

      const expectedVersion = memory.data?.brain_version ?? brain.data?.brain_version ?? 1;

      const body: GroupApproval = {
        proposal_ids: proposals.map(p => p.proposal_id),
        expected_brain_version: expectedVersion,
        reason: 'Author reviewed in editor',
        ...(Object.keys(edited_payloads).length > 0 ? { edited_payloads } : {})
      };

      await acceptProposalGroupAtomic(groupId, body);

      // On successful 200, clear saved edits for this group
      setEdits(previous =>
        Object.fromEntries(
          Object.entries(previous).filter(([pId]) => !proposals.some(p => p.proposal_id === pId))
        )
      );
      setMessageType('success');
      setMessage(`Đã duyệt nhóm đề xuất gồm ${proposals.length} phần tử vào Canon thành công.`);
      await refresh();
    });
  };

  // Group rejection submission (FE-07: transactional group rejection)
  const handleRejectGroup = (groupId: string, proposals: ReviewProposal[], reason?: string) => {
    perform(async () => {
      const expectedVersion = memory.data?.brain_version ?? brain.data?.brain_version ?? 1;

      try {
        await rejectProposalGroupAtomic(groupId, {
          expected_brain_version: expectedVersion,
          reason: reason?.trim() || undefined
        });

        // On successful 200, clear saved edits for this group
        setEdits(previous =>
          Object.fromEntries(
            Object.entries(previous).filter(([pId]) => !proposals.some(p => p.proposal_id === pId))
          )
        );
        setConfirmRejectGroup(null);
        setRejectReason('');
        setMessageType('success');
        setMessage(`Đã loại bỏ toàn bộ nhóm đề xuất gồm ${proposals.length} phần tử thành công.`);
        await refresh();
      } catch (err) {
        setConfirmRejectGroup(null);
        setMessageType('error');
        if (err instanceof ApiClientError && err.status === 409) {
          setMessage(
            'Xung đột phiên bản bộ nhớ (409 Conflict): Phiên bản máy chủ đã thay đổi; các chỉnh sửa cục bộ của bạn được bảo lưu. Vui lòng làm mới.'
          );
        } else {
          setMessage(getApiErrorMessage(err));
        }
        throw err;
      }
    });
  };

  const pending = action.isPending;

  // Group review queue proposals by dependency_group_id
  const grouped = new Map<string, ReviewProposal[]>();
  for (const p of queue.data ?? []) {
    const key = p.dependency_group_id;
    grouped.set(key, [...(grouped.get(key) ?? []), p]);
  }

  const category = (types: string[]) =>
    memory.data?.entities.filter(e => types.includes(e.entity_type.toLowerCase())) ?? [];

  const currentBrainVersion = memory.data?.brain_version ?? brain.data?.brain_version ?? 1;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      size="xl"
      title="Bộ nhớ và định hướng tiểu thuyết"
    >
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            Bộ nhớ chính thức v{currentBrainVersion} · {brain.data?.status ?? 'đang tải'}. Đề xuất chưa duyệt
            chưa được dùng làm sự thật.
          </Text>
          <Badge variant="outline" color="indigo" size="xs">
            Brain v{currentBrainVersion}
          </Badge>
        </Group>

        {(message ||
          action.error ||
          memory.error ||
          queue.error ||
          extraction.error ||
          plan.error ||
          auto.error ||
          job.error) && (
          <Alert
            color={messageType === 'error' ? 'red' : messageType === 'success' ? 'teal' : 'blue'}
            withCloseButton
            onClose={() => setMessage('')}
          >
            {message ||
              getApiErrorMessage(
                memory.error ?? queue.error ?? extraction.error ?? plan.error ?? auto.error ?? job.error
              )}
          </Alert>
        )}

        <Tabs value={tab} onChange={value => { setTab(value ?? 'review'); setProfileTabOpened(value === 'profiles'); }}>
          <Tabs.List>
            <Tabs.Tab value="review">Chờ duyệt ({queue.data?.length ?? 0})</Tabs.Tab>
            <Tabs.Tab value="profiles">Hồ sơ Codex</Tabs.Tab>
            <Tabs.Tab value="characters">Nhân vật ({category(['character', 'per', 'person']).length})</Tabs.Tab>
            <Tabs.Tab value="relations">
              Quan hệ Canon ({memory.data?.relations?.filter(r => r.locked).length ?? 0} khóa)
            </Tabs.Tab>
            <Tabs.Tab value="facts">Dữ kiện ({memory.data?.facts?.length ?? 0})</Tabs.Tab>
            <Tabs.Tab value="history">Sự kiện ({memory.data?.events?.length ?? 0})</Tabs.Tab>
            <Tabs.Tab value="locations">Địa danh</Tabs.Tab>
            <Tabs.Tab value="items">Vật phẩm</Tabs.Tab>
            <Tabs.Tab value="setup">Trích xuất</Tabs.Tab>
            <Tabs.Tab value="plan">Định hướng</Tabs.Tab>
            <Tabs.Tab value="auto">Full auto</Tabs.Tab>
          </Tabs.List>

          {/* ──────────────────────────────────────────
              Tab 1: Review Queue & Checkpoints (B1-B3, B5)
             ────────────────────────────────────────── */}
          <Tabs.Panel value="review" pt="md">
            <Stack gap="md">
              <EntityExtractionReview
                novelId={novelId}
                disabled={pending}
                perform={perform}
                onContinued={refresh}
              />

              {brain.data && (
                <AuthorMemoryRepair
                  novelId={novelId}
                  version={currentBrainVersion}
                  entities={memory.data?.entities ?? []}
                  disabled={pending}
                  perform={perform}
                />
              )}

              <Divider my="xs" label="Đề xuất chờ duyệt vào Canon" labelPosition="center" />

              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  Nhóm đề xuất phụ thuộc ({grouped.size} nhóm · {queue.data?.length ?? 0} đề xuất)
                </Text>
                <Button
                  variant="light"
                  size="xs"
                  disabled={pending || !saved}
                  onClick={() =>
                    perform(async () => {
                      const revisions = await listChapterRevisions(chapterId);
                      if (!revisions[0]) throw new Error('Chưa có bản lưu để phân tích.');
                      await reanalyseSavedChapter(novelId, revisions[0].revisionId);
                      setMessageType('info');
                      setMessage(
                        'Đã phân tích lại bản lưu theo Canon hiện tại. Kiểm tra các nhóm mới bên dưới.'
                      );
                    })
                  }
                >
                  Phân tích lại chương đang mở
                </Button>
              </Group>

              {extraction.data
                ?.filter(e => e.status && e.status !== 'COMPLETED')
                .map(e => (
                  <Alert
                    key={e.chapter_id}
                    color={e.status === 'FAILED' ? 'red' : 'blue'}
                    title={`Chương ${e.chapter_number}`}
                  >
                    {e.status === 'FAILED' ? 'Trích xuất thất bại' : 'Đang xử lý trích xuất'} · đã thử lại{' '}
                    {e.retry_count ?? 0} lần
                  </Alert>
                ))}

              {[...grouped].map(([groupId, proposals]) => {
                const hasEdits = proposals.some(p => edits[p.proposal_id] !== undefined);
                const editedCount = proposals.filter(p => edits[p.proposal_id] !== undefined).length;

                return (
                  <Card withBorder key={groupId} p="sm" radius="md" data-testid={`dependency-group-${groupId}`}>
                    <Stack gap="xs">
                      <Group justify="space-between" align="center">
                        <Group gap="xs">
                          <Text fw={600} size="sm">
                            Nhóm phụ thuộc {groupId.slice(0, 8)}...
                          </Text>
                          <Badge variant="outline" color="gray">
                            {proposals.length} đề xuất
                          </Badge>
                          {hasEdits && (
                            <Badge color="orange" size="xs">
                              Đã chỉnh sửa {editedCount}/{proposals.length}
                            </Badge>
                          )}
                        </Group>

                        <Group gap="xs">
                          {proposals.length > 1 ? (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              disabled={pending}
                              data-testid={`btn-reject-group-${groupId}`}
                              onClick={() => setConfirmRejectGroup({ groupId, count: proposals.length })}
                            >
                              Loại toàn bộ nhóm
                            </Button>
                          ) : (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              disabled={pending}
                              data-testid={`btn-reject-proposal-${proposals[0].proposal_id}`}
                              onClick={() => perform(() => rejectProposal(proposals[0].proposal_id))}
                            >
                              Loại đề xuất
                            </Button>
                          )}
                        </Group>
                      </Group>

                      {proposals.length > 1 ? (
                        <Alert color="blue" icon={<IconAlertTriangle size={14} />} p="xs">
                          <Text size="xs">
                            Nhóm phụ thuộc nguyên tử ({proposals.length} phần tử): Việc duyệt hoặc loại bỏ sẽ áp dụng cho toàn bộ nhóm một cách nhất quán (C-01 / FE-07).
                          </Text>
                        </Alert>
                      ) : (
                        <Text size="xs" c="dimmed">
                          Đề xuất độc lập: Có thể duyệt hoặc loại bỏ an toàn mà không ảnh hưởng đến các đề xuất khác.
                        </Text>
                      )}

                      {/* Proposals list in group */}
                      {proposals.map(p => (
                        <ProposalReview
                          key={p.proposal_id}
                          proposal={p}
                          editedPayload={edits[p.proposal_id]}
                          entities={memory.data?.entities ?? []}
                          disabled={pending}
                          canReject={proposals.length === 1}
                          rejectDisabledReason="Đề xuất này thuộc nhóm phụ thuộc nhiều phần tử. Vui lòng sử dụng 'Loại toàn bộ nhóm' ở đầu nhóm để đảm bảo tính toàn vẹn (C-01 / FE-07)."
                          onEdit={newPayload => setEdits(prev => ({ ...prev, [p.proposal_id]: newPayload }))}
                          onRevertEdit={() =>
                            setEdits(prev => {
                              const updated = { ...prev };
                              delete updated[p.proposal_id];
                              return updated;
                            })
                          }
                          onReject={() => perform(() => rejectProposal(p.proposal_id))}
                        />
                      ))}

                      {/* Group accept button */}
                      <Button
                        color="teal"
                        size="sm"
                        disabled={pending}
                        data-testid={`btn-accept-group-${groupId}`}
                        onClick={() => handleAcceptGroup(groupId, proposals)}
                      >
                        {hasEdits
                          ? `Duyệt nguyên tử nhóm với ${editedCount} đề xuất đã sửa`
                          : `Duyệt nguyên tử toàn bộ nhóm (${proposals.length} đề xuất)`}
                      </Button>
                    </Stack>
                  </Card>
                );
              })}

              {!queue.data?.length && (
                <Paper p="md" withBorder radius="md">
                  <Text size="xs" c="dimmed" ta="center">
                    Không có đề xuất nào đang chờ duyệt.
                  </Text>
                </Paper>
              )}

              {job.data && ['failed', 'waiting_entity_review'].includes(job.data.status) && (
                <Alert color="red" title="Trích xuất gián đoạn">
                  <Text size="sm">
                    Tiến trình trích xuất dừng lại tại chương {job.data.progress?.current ?? '?'}/
                    {job.data.progress?.total ?? '?'}: {job.data.error?.message ?? ''}
                  </Text>
                  <Button
                    mt="xs"
                    size="xs"
                    color="orange"
                    disabled={pending}
                    onClick={() =>
                      perform(async () => {
                        await resumeBootstrapJob(jobId!);
                        await job.refetch();
                      })
                    }
                  >
                    Tiếp tục trích xuất từ chương chưa xong
                  </Button>
                </Alert>
              )}

              {job.data?.status === 'waiting_review' && (
                <Button
                  disabled={pending || Boolean(queue.data?.length)}
                  onClick={() => perform(() => activateBaseline(novelId, jobId!))}
                >
                  Kích hoạt bộ nhớ sau duyệt
                </Button>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="profiles" pt="md">
            <EntityProfileEditor novelId={novelId} entities={memory.data?.entities ?? []}
              active={opened && profileTabOpened} onSaved={refresh} />
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 2: Characters
             ────────────────────────────────────────── */}
          <Tabs.Panel value="characters" pt="md">
            <Stack gap="xs">
              {category(['character', 'per', 'person']).map(e => (
                <Card withBorder key={e.entity_id} p="xs">
                  <Group justify="space-between">
                    <div>
                      <Text fw={600} size="sm">
                        {e.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {e.status} · {e.location || 'Chưa rõ vị trí'}
                      </Text>
                    </div>
                    <Text size="xs" ff="monospace" c="dimmed">
                      UUID: {e.entity_id.slice(0, 8)}...
                    </Text>
                  </Group>
                </Card>
              ))}
              {!category(['character', 'per', 'person']).length && (
                <Text size="xs" c="dimmed">
                  Chưa có nhân vật nào trong Canon.
                </Text>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 3: Exact-ID Relationship Locks (B6)
             ────────────────────────────────────────── */}
          <Tabs.Panel value="relations" pt="md">
            <AuthorRelationshipLocks
              novelId={novelId}
              brainVersion={currentBrainVersion}
              entities={memory.data?.entities ?? []}
              relations={memory.data?.relations ?? []}
              disabled={pending}
              perform={perform}
              onLocked={refresh}
            />
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 4: Facts
             ────────────────────────────────────────── */}
          <Tabs.Panel value="facts" pt="md">
            <Stack gap="xs">
              {memory.data?.facts.map((fact, index) => (
                <Card withBorder key={String(fact.fact_id ?? index)} p="xs">
                  <Group justify="space-between">
                    <Text fw={600} size="sm">
                      {String(fact.fact_key)}
                    </Text>
                    {fact.is_locked && (
                      <Badge color="green" size="xs" leftSection={<IconLock size={10} />}>
                        Đã khóa
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                    {typeof fact.fact_value === 'string'
                      ? fact.fact_value
                      : JSON.stringify(fact.fact_value, null, 2)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Chương {String(fact.chapter_number ?? '—')} · Thực thể{' '}
                    {String(fact.subject_entity_id ?? 'chung')}
                  </Text>
                </Card>
              ))}
              {!memory.data?.facts?.length && (
                <Text size="xs" c="dimmed">
                  Chưa có dữ kiện nào trong Canon.
                </Text>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 5: History & Event Correction (B4)
             ────────────────────────────────────────── */}
          <Tabs.Panel value="history" pt="md">
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={600} size="sm">
                  Lịch sử sự kiện đã ghi nhận ({memory.data?.events?.length ?? 0} sự kiện)
                </Text>
                <Button size="xs" variant="light" disabled={pending || !saved} onClick={() => perform(check)}>
                  Kiểm tra nhất quán chương đang mở
                </Button>
              </Group>

              {findings !== null && (
                <Alert color={findings.length ? 'orange' : 'teal'}>
                  {findings.length
                    ? findings.map((f, i) => (
                        <Text key={i} size="xs">
                          {f.description} — “{f.evidence}”
                        </Text>
                      ))
                    : 'Không tìm thấy mâu thuẫn trong lần kiểm tra này.'}
                  {ruleCheck === 'unavailable' && (
                    <Text size="xs" c="orange" data-testid="rule-check-unavailable">
                      Chưa kiểm tra được theo quy tắc thế giới (AI tạm thời không khả dụng). Kết quả trên chưa bao gồm quy tắc thế giới.
                    </Text>
                  )}
                </Alert>
              )}

              {memory.data?.events
                .filter(
                  e =>
                    !e.metadata?.is_retired &&
                    !memory.data?.events.some(other => other.metadata?.supersedes_id === e.event_id)
                )
                .map(event => (
                  <EventItem
                    key={event.event_id}
                    event={event}
                    entities={memory.data?.entities ?? []}
                    transitions={memory.data?.transitions ?? []}
                    currentBrainVersion={currentBrainVersion}
                    disabled={pending}
                    onCorrect={correction => handleEventCorrection(event, correction)}
                  />
                ))}

              {!memory.data?.events?.length && (
                <Text size="xs" c="dimmed">
                  Chưa có sự kiện nào được ghi nhận.
                </Text>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 6: Locations
             ────────────────────────────────────────── */}
          <Tabs.Panel value="locations" pt="md">
            <Stack gap="xs">
              {category(['location', 'loc', 'place']).map(e => (
                <Card withBorder key={e.entity_id} p="xs">
                  <Text fw={600} size="sm">
                    {e.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {e.status} · {e.location}
                  </Text>
                </Card>
              ))}
              {!category(['location', 'loc', 'place']).length && (
                <Text size="xs" c="dimmed">
                  Chưa có địa danh nào đã duyệt.
                </Text>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 7: Items
             ────────────────────────────────────────── */}
          <Tabs.Panel value="items" pt="md">
            <Stack gap="xs">
              {category(['item', 'object', 'obj']).map(e => (
                <Card withBorder key={e.entity_id} p="xs">
                  <Text fw={600} size="sm">
                    {e.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {e.status} · {e.location}
                  </Text>
                </Card>
              ))}
              {!category(['item', 'object', 'obj']).length && (
                <Text size="xs" c="dimmed">
                  Chưa có vật phẩm nào đã duyệt.
                </Text>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 8: Setup / Bootstrap
             ────────────────────────────────────────── */}
          <Tabs.Panel value="setup" pt="md">
            <Stack gap="xs">
              <Text size="sm">
                Bắt đầu bộ nhớ truyện theo một trong hai cách: trích xuất từ các chương đã lưu (không cần thiết lập thế giới), hoặc hoàn tất thiết lập trong Planning Studio. Với chương đã lưu: bấm trích xuất, duyệt đề xuất ở tab “Chờ duyệt”, rồi bấm “Kích hoạt bộ nhớ sau duyệt”. Sau khi kích hoạt, mỗi lần lưu chương sẽ được phân tích và tạo đề xuất chờ bạn duyệt.
              </Text>
              <Button
                disabled={
                  pending ||
                  !saved ||
                  (brain.data?.status === 'active' && Boolean(brain.data.baseline_revision_id))
                }
                onClick={() => perform(bootstrap)}
              >
                Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu
              </Button>
              <>{onOpenPlanning?<Button onClick={()=>onOpenPlanning("idea")}>Mở thiết lập trong Planning Studio</Button>:<SetupFoundationPanel key={novelId} novelId={novelId} allowOfflineBlueprint={allowOfflineSetupTest}/>}</>
              {job.data && (
                <Alert>
                  Trích xuất: {job.data.status} {job.data.error?.message ?? ''}
                </Alert>
              )}
              {job.data?.status === 'failed' && (
                <Button
                  color="orange"
                  disabled={pending}
                  onClick={() =>
                    perform(async () => {
                      await resumeBootstrapJob(jobId!);
                      await job.refetch();
                    })
                  }
                >
                  Tiếp tục trích xuất từ chương chưa xong
                </Button>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 9: Plan
             ────────────────────────────────────────── */}
          <Tabs.Panel value="plan" pt="md">
            <>{onOpenPlanning?<Button onClick={()=>onOpenPlanning("chapters")}>Mở dàn ý trong Planning Studio</Button>:<StoryPlanEditor novelId={novelId}/>}</>
          </Tabs.Panel>

          {/* ──────────────────────────────────────────
              Tab 10: Auto
             ────────────────────────────────────────── */}
          <Tabs.Panel value="auto" pt="md">
            <Stack gap="xs">
              <Alert>
                AI được tự duyệt bộ nhớ và viết/lưu chương nháp. Xuất bản vẫn do bạn quyết định. Khuyến cáo
                chuẩn bị định hướng; nếu chưa có, hệ thống sẽ tự lập kế hoạch.
              </Alert>
              {auto.data && (
                <Text size="xs">
                  {auto.data.status} · lượt {auto.data.current_iteration} · {auto.data.stop_reason}
                </Text>
              )}
              <Button
                disabled={pending || !brain.data?.baseline_revision_id || auto.data?.status === 'running'}
                onClick={() =>
                  perform(async () => {
                    if (auto.data?.status !== 'running') {
                      const run = await memoryPost<AutoRun>('/ai/autonomous/runs', {
                        novel_id: novelId,
                        max_iterations: 100
                      });
                      localStorage.setItem(`ephurin-auto-${novelId}`, run.run_id);
                    }
                  })
                }
              >
                {auto.data?.status === 'running' ? 'Full auto đang chạy' : 'Bật full auto'}
              </Button>
              <Button
                variant="default"
                disabled={auto.data?.status !== 'running'}
                onClick={() => {
                  perform(() =>
                    memoryPost(`/ai/autonomous/runs/${auto.data!.run_id}/stop`, { reason: 'author_stopped' })
                  );
                }}
              >
                Dừng full auto
              </Button>
              <Text size="xs" c="dimmed">
                Tiến trình chạy trên máy chủ. Bạn có thể rời trang rồi quay lại theo dõi.
              </Text>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>

      {/* Confirmation Modal for Atomic Group Rejection (FE-07) */}
      <Modal
        opened={Boolean(confirmRejectGroup)}
        onClose={() => {
          if (!pending) {
            setConfirmRejectGroup(null);
            setRejectReason('');
          }
        }}
        title="Xác nhận loại toàn bộ nhóm đề xuất"
        centered
        data-testid="modal-confirm-reject-group"
      >
        <Stack gap="sm">
          <Text size="sm">
            Bạn có chắc chắn muốn loại bỏ toàn bộ nhóm đề xuất gồm{' '}
            <b>{confirmRejectGroup?.count}</b> phần tử?
          </Text>
          <Text size="xs" c="dimmed">
            Thao tác này sẽ từ chối tất cả các đề xuất phụ thuộc trong nhóm một cách nguyên tử và không thể hoàn tác. Không có thay đổi nào được ghi vào Canon.
          </Text>
          <TextInput
            size="xs"
            label="Lý do từ chối (tùy chọn)"
            placeholder="Nhập lý do tác giả từ chối nhóm đề xuất..."
            value={rejectReason}
            onChange={e => setRejectReason(e.currentTarget.value)}
            data-testid="input-reject-group-reason"
            disabled={pending}
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              size="xs"
              onClick={() => {
                setConfirmRejectGroup(null);
                setRejectReason('');
              }}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button
              color="red"
              size="xs"
              data-testid="btn-confirm-reject-group"
              loading={pending}
              onClick={() => {
                if (confirmRejectGroup) {
                  const targetProposals = grouped.get(confirmRejectGroup.groupId) ?? [];
                  handleRejectGroup(confirmRejectGroup.groupId, targetProposals, rejectReason);
                }
              }}
            >
              Xác nhận loại toàn bộ nhóm
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  );
}

// ──────────────────────────────────────────────
// Safe Proposal Review Component (B5)
// ──────────────────────────────────────────────

function ProposalReview({
  proposal,
  editedPayload,
  entities,
  disabled,
  canReject = true,
  rejectDisabledReason,
  onEdit,
  onRevertEdit,
  onReject
}: {
  proposal: ReviewProposal;
  editedPayload?: Record<string, unknown>;
  entities: MemoryEntity[];
  disabled: boolean;
  canReject?: boolean;
  rejectDisabledReason?: string;
  onEdit: (payload: Record<string, unknown>) => void;
  onRevertEdit: () => void;
  onReject: () => void;
}) {
  const isEdited = editedPayload !== undefined;
  const currentPayload = editedPayload ?? proposal.payload;
  const p = currentPayload;
  const original = proposal.payload;

  // Build entity options for entity selection
  const entityOptions = entities.map(e => ({
    value: e.entity_id,
    label: `${e.name} [${e.entity_type}] · ID: ${e.entity_id}`
  }));

  if (proposal.proposal_type === 'alias') {
    return (
      <Paper p="xs" withBorder radius="sm">
        <Stack gap="xs">
          <Group justify="space-between">
            <Badge color="violet">Tên gọi / Alias</Badge>
            <Button
              variant="subtle"
              size="compact-xs"
              color="red"
              disabled={disabled || !canReject}
              title={!canReject ? rejectDisabledReason : undefined}
              onClick={onReject}
            >
              Loại đề xuất
            </Button>
          </Group>
          <Text fw={600} size="sm">
            {String(p.alias ?? '')} → {String(p.entity_name ?? p.entity_id ?? '')}
          </Text>
          <Text size="xs" c="dimmed">
            Chỉ liên kết danh tính sau khi bạn duyệt. Nếu đây là hai người khác nhau, hãy loại đề xuất.
          </Text>
          {typeof p.identity_quote === 'string' && (
            <Paper p="xs" bg="var(--mantine-color-gray-0)">
              <Text size="xs">“{p.identity_quote}”</Text>
            </Paper>
          )}
        </Stack>
      </Paper>
    );
  }

  if (p.reuse_artifact_id) {
    return (
      <Paper p="xs" withBorder radius="sm">
        <Stack gap="xs">
          <Group justify="space-between">
            <Badge color="cyan">Đã có trong Canon — Giữ nguyên</Badge>
            <Button
              variant="subtle"
              size="compact-xs"
              color="red"
              disabled={disabled || !canReject}
              title={!canReject ? rejectDisabledReason : undefined}
              onClick={onReject}
            >
              Loại đề xuất
            </Button>
          </Group>
          <Text size="sm">
            {String(p.summary ?? p.fact_key ?? '')}:{' '}
            {typeof p.fact_value === 'string' ? p.fact_value : JSON.stringify(p.fact_value)}
          </Text>
          <Text size="xs" c="dimmed">
            Bản ghi {String(p.reuse_artifact_id)} · {String(p.reconciliation_reason ?? '')}
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="xs" withBorder radius="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Badge color="blue">{proposal.proposal_type}</Badge>
            {isEdited && (
              <Badge color="orange" size="xs" leftSection={<IconEdit size={10} />}>
                Đã chỉnh sửa bởi tác giả
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {isEdited && (
              <Button
                variant="subtle"
                size="compact-xs"
                color="gray"
                leftSection={<IconRotate size={12} />}
                onClick={onRevertEdit}
                disabled={disabled}
              >
                Hoàn tác sửa
              </Button>
            )}
            <Button
              variant="subtle"
              size="compact-xs"
              color="red"
              disabled={disabled || !canReject}
              title={!canReject ? rejectDisabledReason : undefined}
              onClick={onReject}
            >
              Loại đề xuất
            </Button>
          </Group>
        </Group>

        {p.supersedes_id ? (
          <Alert color="blue">
            {p.is_retired
              ? 'Đề xuất gỡ khỏi Canon hiện hành; vẫn giữ lịch sử.'
              : 'Đề xuất thay thế phiên bản cũ; vẫn giữ lịch sử.'}{' '}
            Nguồn cũ: {String(p.supersedes_id)}
          </Alert>
        ) : null}

        {/* 1. Event Proposal Editing */}
        {proposal.proposal_type === 'event' && (
          <Stack gap="xs">
            <TextInput
              size="xs"
              label="Loại sự kiện (event_type)"
              value={String(p.event_type ?? '')}
              onChange={e => onEdit({ ...p, event_type: e.currentTarget.value })}
              disabled={disabled}
            />
            <Textarea
              size="xs"
              label="Tóm tắt sự kiện (summary)"
              value={String(p.summary ?? '')}
              onChange={e => onEdit({ ...p, summary: e.currentTarget.value })}
              disabled={disabled}
              autosize
              minRows={2}
            />
            {isEdited && original.summary !== p.summary && (
              <Text size="xs" c="dimmed">
                Gốc từ AI: &ldquo;{String(original.summary ?? '')}&rdquo;
              </Text>
            )}
            <TextInput
              size="xs"
              label="Nhân vật tham gia (phân cách bằng dấu phẩy)"
              value={Array.isArray(p.participants) ? p.participants.join(', ') : ''}
              onChange={e =>
                onEdit({
                  ...p,
                  participants: e.currentTarget.value
                    .split(',')
                    .map(x => x.trim())
                    .filter(Boolean)
                })
              }
              disabled={disabled}
            />
          </Stack>
        )}

        {/* 2. Fact Proposal Editing (FE-04: Preserve typed numbers/booleans/JSON) */}
        {proposal.proposal_type === 'fact' && (
          <Stack gap="xs">
            <TextInput
              size="xs"
              label="Khóa dữ kiện (fact_key)"
              value={String(p.fact_key ?? '')}
              onChange={e => onEdit({ ...p, fact_key: e.currentTarget.value })}
              disabled={disabled}
            />
            <Select
              size="xs"
              label="Thực thể của dữ kiện (subject_entity_id)"
              placeholder="Chọn thực thể đã duyệt..."
              data={entityOptions}
              value={String(p.subject_entity_id ?? '') || null}
              onChange={val => onEdit({ ...p, subject_entity_id: val })}
              searchable
              clearable
              disabled={disabled || entities.length === 0}
            />
            <Textarea
              size="xs"
              label="Giá trị dữ kiện (fact_value)"
              value={typeof p.fact_value === 'string' ? p.fact_value : JSON.stringify(p.fact_value ?? '')}
              onChange={e => {
                const raw = e.currentTarget.value;
                const orig = original.fact_value;
                let parsed: unknown = raw;
                if (typeof orig === 'number' && !isNaN(Number(raw)) && raw.trim() !== '') {
                  parsed = Number(raw);
                } else if (typeof orig === 'boolean') {
                  if (raw.trim().toLowerCase() === 'true') parsed = true;
                  else if (raw.trim().toLowerCase() === 'false') parsed = false;
                } else if (typeof orig === 'object' && orig !== null) {
                  try {
                    parsed = JSON.parse(raw);
                  } catch {
                    parsed = raw;
                  }
                }
                onEdit({ ...p, fact_value: parsed });
              }}
              disabled={disabled}
              autosize
              minRows={2}
            />
          </Stack>
        )}

        {/* 3. State Transition Proposal Editing (FE-04: Preserve typed numbers/booleans/JSON) */}
        {proposal.proposal_type === 'state_transition' && (
          <Stack gap="xs">
            <Select
              size="xs"
              label="Thực thể (entity_id)"
              placeholder="Chọn thực thể..."
              data={entityOptions}
              value={String(p.entity_id ?? '') || null}
              onChange={val => onEdit({ ...p, entity_id: val })}
              searchable
              clearable
              disabled={disabled || entities.length === 0}
            />
            <TextInput
              size="xs"
              label="Thuộc tính thay đổi (attribute_key)"
              value={String(p.attribute_key ?? '')}
              onChange={e => onEdit({ ...p, attribute_key: e.currentTarget.value })}
              disabled={disabled}
            />
            <TextInput
              size="xs"
              label="Giá trị mới (new_value)"
              value={typeof p.new_value === 'string' ? p.new_value : JSON.stringify(p.new_value ?? '')}
              onChange={e => {
                const raw = e.currentTarget.value;
                const orig = original.new_value;
                let parsed: unknown = raw;
                if ((p.attribute_key === 'health' || typeof orig === 'number') && !isNaN(Number(raw)) && raw.trim() !== '') {
                  parsed = Number(raw);
                } else if (typeof orig === 'boolean') {
                  if (raw.trim().toLowerCase() === 'true') parsed = true;
                  else if (raw.trim().toLowerCase() === 'false') parsed = false;
                } else if (typeof orig === 'object' && orig !== null) {
                  try {
                    parsed = JSON.parse(raw);
                  } catch {
                    parsed = raw;
                  }
                }
                onEdit({ ...p, new_value: parsed });
              }}
              disabled={disabled}
            />
          </Stack>
        )}

        {/* 4. Entity Proposal Editing (FE-04: Whitelist only canonical_name/normalized_name) */}
        {proposal.proposal_type === 'entity' && (
          <Stack gap="xs">
            <TextInput
              size="xs"
              label="Tên chuẩn thực thể (canonical_name)"
              value={String(p.canonical_name ?? '')}
              onChange={e => {
                const name = e.currentTarget.value;
                onEdit({
                  ...p,
                  canonical_name: name,
                  normalized_name: entityNameEditError(name) ? '' : normalizeEntityName(name)
                });
              }}
              error={entityNameEditError(String(p.canonical_name ?? ''))}
              disabled={disabled}
            />
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

// ──────────────────────────────────────────────
// Approved Event Item & Correction Component (B4)
// ──────────────────────────────────────────────

function EventItem({
  event,
  entities,
  transitions,
  currentBrainVersion,
  disabled,
  onCorrect
}: {
  event: MemoryEvent;
  entities: MemoryEntity[];
  transitions: Transition[];
  currentBrainVersion: number;
  disabled: boolean;
  onCorrect: (correction: EventCorrection) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(event.summary);
  const [eventType, setEventType] = useState(event.event_type);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Identify authoritative entity UUIDs in participants.
  // Never guess by matching display name (FE-02: Minh A vs Minh B must never auto-resolve).
  const initialParticipantUuids = event.participants
    .map(p => {
      const byId = entities.find(e => e.entity_id === p);
      return byId ? byId.entity_id : null;
    })
    .filter((id): id is string => Boolean(id));

  // Legacy unresolved participants (names without UUIDs) with positional tracking (FE-12)
  const legacyOccurrences = useMemo(() => {
    return event.participants
      .map((name, index) => ({ name, index, isLegacy: !entities.some(e => e.entity_id === name) }))
      .filter(item => item.isLegacy);
  }, [event.participants, entities]);

  const unresolvedLegacyParticipants = useMemo(() => {
    return legacyOccurrences.map(o => o.name);
  }, [legacyOccurrences]);

  const hasDuplicateLegacyNames = useMemo(() => {
    const names = legacyOccurrences.map(o => o.name);
    return new Set(names).size !== names.length;
  }, [legacyOccurrences]);

  const getOccKey = (occ: { name: string; index: number }) =>
    hasDuplicateLegacyNames ? `${occ.name}#${occ.index}` : occ.name;

  // Manual participant selections (direct UUID selections, independent of legacy mappings) (FE-12)
  const [manualParticipants, setManualParticipants] = useState<string[]>(initialParticipantUuids);

  // Track explicit author mapping of legacy participant strings to canonical entity UUIDs (FE-08, FE-12)
  const [legacyResolutions, setLegacyResolutions] = useState<Record<string, string>>({});

  // Transitions tied to this event
  const eventTransitions = transitions.filter(t => t.event_id === event.event_id);
  const [transitionEdits, setTransitionEdits] = useState<Array<{ entity_id: string; attribute_key: string; new_value: unknown }>>(
    () =>
      eventTransitions.map(t => ({
        entity_id: t.entity_id,
        attribute_key: t.attribute_key,
        new_value: t.new_value
      }))
  );

  const entityOptions = entities.map(e => ({
    value: e.entity_id,
    label: `${e.name} [${e.entity_type}] · ID: ${e.entity_id}`
  }));

  // Fail closed if any legacy participant remains unresolved (FE-08, FE-12)
  const allLegacyResolved =
    legacyOccurrences.length === 0 ||
    legacyOccurrences.every(occ => {
      const resolvedId = legacyResolutions[getOccKey(occ)];
      return Boolean(resolvedId) && entities.some(e => e.entity_id === resolvedId);
    });

  // Effective participants to send: directly selected UUIDs + current resolved legacy UUIDs (FE-12: deterministic, no ghost UUIDs)
  const resolvedLegacyUuids = legacyOccurrences
    .map(occ => legacyResolutions[getOccKey(occ)])
    .filter((id): id is string => Boolean(id) && entities.some(e => e.entity_id === id));

  const effectiveParticipants = Array.from(
    new Set([...manualParticipants, ...resolvedLegacyUuids])
  );

  // Check if all participants are valid UUIDs from canonical entities and no legacy participant is unmapped
  const allParticipantsValid =
    effectiveParticipants.length > 0 &&
    allLegacyResolved &&
    effectiveParticipants.every(id => entities.some(e => e.entity_id === id));

  const handleSubmitCorrection = async () => {
    if (!summary.trim()) return;
    if (unresolvedLegacyParticipants.length > 0 && !allLegacyResolved) {
      setSubmitError(
        'Tất cả nhân vật tham gia chưa xác thực phải được gán UUID chính xác từ Canon trước khi gửi đề xuất (FE-08).'
      );
      return;
    }
    if (effectiveParticipants.length === 0) {
      setSubmitError('Vui lòng chọn ít nhất một nhân vật tham gia bằng UUID chính xác từ Canon.');
      return;
    }
    if (!allParticipantsValid) {
      setSubmitError('Một hoặc nhiều nhân vật tham gia không tồn tại trong danh sách Canon chính thức.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    const correction: EventCorrection = {
      expected_brain_version: currentBrainVersion,
      replacement: {
        event_type: eventType.trim() || event.event_type,
        summary: summary.trim(),
        participants: effectiveParticipants,
        chapter: event.chapter
      },
      transitions: transitionEdits.filter(t => t.entity_id && t.attribute_key.trim())
    };

    try {
      await onCorrect(correction);
      // On successful HTTP 201, close editor
      setEditing(false);
    } catch (err) {
      // On 409, 422, network timeout, or error: preserve visible edits and show error!
      if (err instanceof ApiClientError) {
        if (err.status === 409) {
          setSubmitError(
            'Xung đột phiên bản Story Brain (409 Conflict): Phiên bản máy chủ đã thay đổi; bản nháp chỉnh sửa của bạn vẫn được giữ nguyên.'
          );
        } else if (err.status === 422) {
          setSubmitError(
            `Dữ liệu không hợp lệ (422): ${getApiErrorMessage(err)}. Bản nháp chỉnh sửa của bạn vẫn được giữ nguyên.`
          );
        } else {
          setSubmitError(getApiErrorMessage(err));
        }
      } else {
        setSubmitError(String(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card withBorder radius="sm" p="xs" data-testid={`event-card-${event.event_id}`}>
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Badge variant="filled" color="indigo" size="xs">
              Chương {event.chapter}
            </Badge>
            <Badge variant="outline" size="xs">
              {event.event_type}
            </Badge>
          </Group>
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconEdit size={12} />}
            disabled={disabled}
            data-testid={`btn-edit-event-${event.event_id}`}
            onClick={() => setEditing(prev => !prev)}
          >
            {editing ? 'Đóng chỉnh sửa' : 'Đề xuất chỉnh sửa'}
          </Button>
        </Group>

        <Text size="sm" fw={500}>
          {event.summary}
        </Text>

        {/* Display participants (FE-02: explicit UUID or unresolved warning) */}
        {event.participants.length > 0 && (
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Nhân vật:
            </Text>
            {event.participants.map((p, i) => {
              const matchedEntity = entities.find(e => e.entity_id === p);
              return matchedEntity ? (
                <Badge key={i} size="xs" variant="light" color="cyan">
                  {matchedEntity.name} ({matchedEntity.entity_id.slice(0, 6)}...)
                </Badge>
              ) : (
                <Badge key={i} size="xs" variant="filled" color="red">
                  Chưa xác thực UUID: {p}
                </Badge>
              );
            })}
          </Group>
        )}

        {/* Display linked transitions */}
        {eventTransitions.length > 0 && (
          <Paper p="xs" bg="var(--mantine-color-gray-0)" radius="xs">
            <Stack gap={2}>
              <Text size="xs" fw={600} c="dimmed">
                Trạng thái gắn liền với sự kiện:
              </Text>
              {eventTransitions.map((t, idx) => {
                const entity = entities.find(e => e.entity_id === t.entity_id);
                return (
                  <Text key={idx} size="xs">
                    • {entity ? entity.name : t.entity_id} → {t.attribute_key}:{' '}
                    {typeof t.new_value === 'string' ? t.new_value : JSON.stringify(t.new_value)}
                  </Text>
                );
              })}
            </Stack>
          </Paper>
        )}

        {/* Collapsible Correction Editor */}
        <Collapse in={editing}>
          <Paper p="xs" withBorder radius="sm" mt="xs">
            <Stack gap="xs">
              <Text size="xs" fw={600}>
                Tạo đề xuất chỉnh sửa sự kiện (Event Correction Proposal):
              </Text>
              <Text size="xs" c="dimmed">
                Lưu ý: Thao tác này tạo một đề xuất chỉnh sửa đang chờ duyệt. Đề xuất này CHƯA trở thành Canon
                cho đến khi được chấp thuận trong tab &quot;Chờ duyệt&quot;.
              </Text>

              {unresolvedLegacyParticipants.length > 0 && (
                <Paper p="xs" withBorder bg="var(--mantine-color-orange-0)" radius="sm" data-testid="box-legacy-resolution">
                  <Stack gap="xs">
                    <Group gap="xs">
                      <IconAlertTriangle size={16} color="var(--mantine-color-orange-7)" />
                      <Text size="xs" fw={600} c="orange.9">
                        Yêu cầu ánh xạ danh tính chính xác (FE-08):
                      </Text>
                    </Group>
                    <Text size="xs">
                      Sự kiện gốc chứa {unresolvedLegacyParticipants.length} người tham gia dạng văn bản chưa có UUID ({unresolvedLegacyParticipants.join(', ')}).
                      Để tránh nhầm lẫn giữa các nhân vật cùng tên (như Minh A và Minh B) và tránh mất người tham gia, bạn phải gán UUID chính xác từ danh sách Canon cho từng người trước khi gửi.
                    </Text>
                    {legacyOccurrences.map(occ => {
                      const occKey = getOccKey(occ);
                      const label = hasDuplicateLegacyNames
                        ? `Ánh xạ danh tính cho "${occ.name}" (lần xuất hiện ${occ.index + 1}):`
                        : `Ánh xạ danh tính cho "${occ.name}":`;
                      return (
                        <Select
                          key={occKey}
                          size="xs"
                          label={label}
                          placeholder="Chọn nhân vật có ID chính xác từ Canon..."
                          data={entityOptions}
                          value={legacyResolutions[occKey] || null}
                          onChange={val => {
                            setLegacyResolutions(prev => {
                              const next = { ...prev };
                              if (val) {
                                next[occKey] = val;
                              } else {
                                delete next[occKey];
                              }
                              return next;
                            });
                          }}
                          data-testid={`select-resolve-legacy-${occ.name}`}
                          searchable
                          clearable
                          clearButtonProps={{
                            'data-testid': `btn-clear-legacy-${occ.name}`,
                            'aria-label': `Xóa ánh xạ ${occ.name}`
                          } as any}
                          required
                          disabled={disabled || isSubmitting}
                          comboboxProps={{ withinPortal: false }}
                        />
                      );
                    })}
                  </Stack>
                </Paper>
              )}

              {submitError && (
                <Alert color="red" title="Lỗi gửi chỉnh sửa sự kiện" withCloseButton onClose={() => setSubmitError(null)}>
                  {submitError}
                </Alert>
              )}

              <TextInput
                size="xs"
                label="Loại sự kiện (event_type)"
                value={eventType}
                onChange={e => setEventType(e.currentTarget.value)}
                disabled={disabled || isSubmitting}
              />

              <Textarea
                size="xs"
                label="Tóm tắt sự kiện đã sửa (summary)"
                value={summary}
                onChange={e => setSummary(e.currentTarget.value)}
                disabled={disabled || isSubmitting}
                autosize
                minRows={2}
              />

              <MultiSelect
                size="xs"
                label="Nhân vật tham gia bổ sung / trực tiếp (chọn bằng UUID chính xác từ Canon)"
                placeholder="Chọn nhân vật..."
                data={entityOptions}
                value={manualParticipants}
                onChange={setManualParticipants}
                searchable
                clearable
                disabled={disabled || isSubmitting || entities.length === 0}
                data-testid="multiselect-manual-participants"
                comboboxProps={{ withinPortal: false }}
              />

              {/* Editable Transitions */}
              <Stack gap="xs">
                <Text size="xs" fw={500}>
                  Trạng thái cập nhật đi kèm (Transitions):
                </Text>
                {transitionEdits.map((tr, tIdx) => (
                  <Group key={tIdx} grow align="flex-end">
                    <Select
                      size="xs"
                      label="Thực thể"
                      data={entityOptions}
                      value={tr.entity_id}
                      onChange={val =>
                        setTransitionEdits(prev =>
                          prev.map((x, i) => (i === tIdx ? { ...x, entity_id: val || '' } : x))
                        )
                      }
                      searchable
                      disabled={disabled || isSubmitting}
                    />
                    <TextInput
                      size="xs"
                      label="Thuộc tính"
                      value={tr.attribute_key}
                      onChange={e =>
                        setTransitionEdits(prev =>
                          prev.map((x, i) => (i === tIdx ? { ...x, attribute_key: e.currentTarget.value } : x))
                        )
                      }
                      disabled={disabled || isSubmitting}
                    />
                    <TextInput
                      size="xs"
                      label="Giá trị mới"
                      value={typeof tr.new_value === 'string' ? tr.new_value : JSON.stringify(tr.new_value ?? '')}
                      onChange={e =>
                        setTransitionEdits(prev =>
                          prev.map((x, i) => (i === tIdx ? { ...x, new_value: e.currentTarget.value } : x))
                        )
                      }
                      disabled={disabled || isSubmitting}
                    />
                    <Button
                      size="xs"
                      color="red"
                      variant="subtle"
                      onClick={() => setTransitionEdits(prev => prev.filter((_, i) => i !== tIdx))}
                      disabled={disabled || isSubmitting}
                    >
                      Bỏ
                    </Button>
                  </Group>
                ))}

                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() =>
                    setTransitionEdits(prev => [
                      ...prev,
                      { entity_id: entities[0]?.entity_id || '', attribute_key: '', new_value: '' }
                    ])
                  }
                  disabled={disabled || isSubmitting || entities.length === 0}
                >
                  + Thêm cập nhật trạng thái
                </Button>
              </Stack>

              <Group justify="flex-end" mt="xs">
                <Button size="xs" variant="default" onClick={() => setEditing(false)} disabled={disabled || isSubmitting}>
                  Hủy
                </Button>
                <Button
                  size="xs"
                  color="indigo"
                  data-testid={`btn-submit-correction-${event.event_id}`}
                  onClick={handleSubmitCorrection}
                  disabled={
                    disabled ||
                    isSubmitting ||
                    !summary.trim() ||
                    !allLegacyResolved ||
                    effectiveParticipants.length === 0 ||
                    !allParticipantsValid
                  }
                  loading={isSubmitting}
                >
                  Gửi đề xuất chỉnh sửa (Tạo proposal chờ duyệt)
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Collapse>
      </Stack>
    </Card>
  );
}
