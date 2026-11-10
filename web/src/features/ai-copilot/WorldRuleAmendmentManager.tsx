import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { useAuthStore } from '../auth/useAuthStore';
import { usePlanningDraft, usePlanningScope } from './planning-draft';
import {
  decideWorldRuleAmendment,
  getWorldRuleAmendments,
  proposeWorldRuleAmendment,
  type WorldRuleAmendmentHistory,
  type WorldRuleAmendmentHistoryItem,
  type WorldRuleLineageEntry,
} from './setup-api';
import { getApprovedMemory, type ApprovedMemory, type MemoryFact } from './author-memory-api';

export type WorldRuleFact = {
  fact_id: string;
  fact_key: string;
  fact_value: string;
  is_locked: boolean;
  supersedes_id: string | null;
  created_at?: string;
  root_fact_id?: string;
};

type ProposalDraft = {
  replacement_text: string;
  private_notes: string;
  expected_brain_version: number;
};

type DecisionDraft = {
  reason: string;
  expected_brain_version: number;
};

function validProposalDraft(v: unknown): v is ProposalDraft {
  const d = v as ProposalDraft;
  return (
    !!d &&
    typeof d.replacement_text === 'string' &&
    typeof d.private_notes === 'string' &&
    Number.isInteger(d.expected_brain_version)
  );
}

function validDecisionDraft(v: unknown): v is DecisionDraft {
  const d = v as DecisionDraft;
  return (
    !!d &&
    typeof d.reason === 'string' &&
    Number.isInteger(d.expected_brain_version)
  );
}

function formatFactValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value) return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.statement === 'string') return obj.statement;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.summary === 'string') return obj.summary;
    if (typeof obj.description === 'string') return obj.description;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

interface Props {
  novelId: string;
  brainVersion?: number;
  m0Active?: boolean;
  onServerChange?: () => void;
  preloadedRules?: WorldRuleFact[];
}

export function WorldRuleAmendmentManager({
  novelId,
  brainVersion: initialBrainVersion,
  m0Active = true,
  onServerChange,
  preloadedRules,
}: Props) {
  const scope = usePlanningScope();
  const actor = useAuthStore((s) => s.user?.userId ?? 'guest');

  const [rules, setRules] = useState<WorldRuleFact[]>(preloadedRules ?? []);
  const [brainVersion, setBrainVersion] = useState<number>(initialBrainVersion ?? 1);
  const [memStatus, setMemStatus] = useState<string>('draft');
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Selected rule for proposing an amendment (keyed strictly by Fact UUID)
  const [proposingFactId, setProposingFactId] = useState<string | null>(null);

  // Selected rule for viewing history / lineage (strictly Fact UUID)
  const [historyFactId, setHistoryFactId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<WorldRuleAmendmentHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Active pending proposals map by FACT_ID (Fact UUID), NEVER by fact_key! (UXF-01)
  const [pendingProposalsByFactId, setPendingProposalsByFactId] = useState<
    Record<string, { proposal: WorldRuleAmendmentHistoryItem; history: WorldRuleAmendmentHistory }>
  >({});

  // Non-setup / ineligible rules map by FACT_ID (UXF-01)
  const [ineligibleFacts, setIneligibleFacts] = useState<Record<string, string>>({});

  // History load errors map by FACT_ID (UXF-01: do not silently swallow errors)
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // React to prop changes (UXF-03: keep Brain version in sync with parent snapshot)
  useEffect(() => {
    if (initialBrainVersion !== undefined && initialBrainVersion !== brainVersion) {
      setBrainVersion(initialBrainVersion);
    }
  }, [initialBrainVersion]);

  // Reload approved memory to get current effective World Rules
  async function reloadRules(silent = false) {
    if (!silent) setLoading(true);
    setGeneralError('');
    try {
      const mem = await getApprovedMemory(novelId);
      if (!isMounted.current) return;
      setBrainVersion(mem.brain_version);
      setMemStatus(mem.status || 'draft');

      // Filter only world_rule facts from memory
      const effectiveRules: WorldRuleFact[] = (mem.facts || [])
        .filter((f: MemoryFact) => f.fact_type === 'world_rule')
        .map((f: MemoryFact) => ({
          fact_id: String(f.fact_id ?? f.id ?? ''),
          fact_key: f.fact_key,
          fact_value: formatFactValue(f.fact_value),
          is_locked: !!f.is_locked,
          supersedes_id: f.supersedes_id ? String(f.supersedes_id) : null,
          created_at: typeof f.created_at === 'string' ? f.created_at : undefined,
        }))
        .filter((r) => !!r.fact_id);

      setRules(effectiveRules);

      // UXF-01: Check history and pending proposals per immutable Fact UUID
      const newPendingMap: Record<
        string,
        { proposal: WorldRuleAmendmentHistoryItem; history: WorldRuleAmendmentHistory }
      > = {};
      const newIneligibleMap: Record<string, string> = {};
      const newErrorsMap: Record<string, string> = {};

      await Promise.all(
        effectiveRules.map(async (r) => {
          try {
            const h = await getWorldRuleAmendments(novelId, r.fact_id, scope.signal);
            if (h.contract_version !== 'setup-rule-amendment-v1' || !h.root_fact_id) {
              newIneligibleMap[r.fact_id] = 'Quy tắc không thuộc phả hệ World Setup đã kích hoạt.';
              return;
            }
            // Bind pending proposal strictly to the current effective head fact_id
            const pending = (h.proposals || []).find((p) => p.status === 'pending');
            if (pending) {
              newPendingMap[r.fact_id] = { proposal: pending, history: h };
            }
          } catch (err: unknown) {
            if (err instanceof ApiClientError) {
              if (err.status === 404 || err.status === 422) {
                // Rule does not belong to verified M0 setup root
                newIneligibleMap[r.fact_id] = 'Quy tắc này không thuộc thiết lập M0 của tác phẩm (không thể hiệu chỉnh).';
                return;
              }
              newErrorsMap[r.fact_id] = getApiErrorMessage(err);
            } else {
              newErrorsMap[r.fact_id] = 'Không thể kiểm tra trạng thái quy tắc.';
            }
          }
        })
      );

      if (isMounted.current) {
        setPendingProposalsByFactId(newPendingMap);
        setIneligibleFacts(newIneligibleMap);
        setHistoryErrors(newErrorsMap);
      }
    } catch (e) {
      if (!isMounted.current) return;
      if (e instanceof ApiClientError && e.status === 404) {
        setRules([]);
        setMemStatus('draft');
      } else {
        setGeneralError(getApiErrorMessage(e));
      }
    } finally {
      if (isMounted.current && !silent) setLoading(false);
    }
  }

  // Reload on novelId change or when M0 activation status changes (UXF-03)
  useEffect(() => {
    void reloadRules();
  }, [novelId, initialBrainVersion, m0Active]);

  // Load history modal
  async function openHistory(factId: string) {
    setHistoryFactId(factId);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const h = await getWorldRuleAmendments(novelId, factId, scope.signal);
      if (isMounted.current) {
        setHistoryData(h);
      }
    } catch (e) {
      if (isMounted.current) {
        setHistoryError(getApiErrorMessage(e));
      }
    } finally {
      if (isMounted.current) {
        setHistoryLoading(false);
      }
    }
  }

  // M0 Activation verification (UXF-03)
  const isM0Verified = Boolean(m0Active || memStatus === 'active');

  return (
    <Stack gap="md" data-testid="world-rule-amendment-manager">
      <Group justify="space-between" align="center">
        <div>
          <Title order={4}>Quản lý Quy tắc Thế giới (World Setup Rules)</Title>
          <Text size="sm" c="dimmed">
            Quy tắc đã được tác giả phê duyệt sau mốc M0. Mọi đề xuất hiệu chỉnh đều bảo toàn lịch sử
            Canon và trải qua quy trình duyệt hai bước (Propose &rarr; Accept/Reject).
          </Text>
        </div>
        <Button variant="default" size="xs" onClick={() => void reloadRules()} loading={loading}>
          Làm mới quy tắc
        </Button>
      </Group>

      {/* UXF-03: M0 Not Active Banner */}
      {!isM0Verified && (
        <Alert color="blue" title="Thiết lập M0 chưa được kích hoạt" data-testid="m0-not-active-banner">
          <Text size="sm">
            Quy tắc thế giới chỉ có thể hiệu chỉnh sau khi hoàn tất phê duyệt và kích hoạt mốc M0.
            Vui lòng kích hoạt thiết lập M0 ở trên trước khi thực hiện hiệu chỉnh.
          </Text>
        </Alert>
      )}

      {generalError && (
        <Alert color="red" title="Lỗi nạp quy tắc thế giới" role="alert">
          {generalError}
        </Alert>
      )}

      {actionSuccess && (
        <Alert color="green" onClose={() => setActionSuccess('')} withCloseButton>
          {actionSuccess}
        </Alert>
      )}

      {rules.length === 0 && !loading && (
        <Card withBorder p="md">
          <Text c="dimmed" size="sm" ta="center">
            {isM0Verified
              ? 'Chưa có quy tắc thế giới nào trong bộ nhớ truyện.'
              : 'Chưa có quy tắc thế giới nào được phê duyệt sau mốc M0, hoặc thiết lập thế giới chưa được kích hoạt. Hãy hoàn tất duyệt và kích hoạt thiết lập M0 ở trên để bắt đầu quản lý.'}
          </Text>
        </Card>
      )}

      <Stack gap="sm">
        {rules.map((rule, idx) => {
          // UXF-01: strictly bind pending proposal by Fact UUID!
          const pendingInfo = pendingProposalsByFactId[rule.fact_id];
          const isIneligible = Boolean(ineligibleFacts[rule.fact_id]);
          const historyErr = historyErrors[rule.fact_id];
          const isProposing = proposingFactId === rule.fact_id;

          return (
            <Card
              withBorder
              key={rule.fact_id}
              p="md"
              shadow="xs"
              data-testid={`rule-card-${rule.fact_id}`}
            >
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Group gap="xs">
                      <Text fw={700}>
                        Quy tắc {idx + 1}: {rule.fact_key}
                      </Text>
                      {rule.is_locked ? (
                        <Badge color="red" variant="filled" data-testid={`lock-badge-locked-${rule.fact_id}`}>
                          Bất biến (Locked)
                        </Badge>
                      ) : (
                        <Badge color="teal" variant="light" data-testid={`lock-badge-standard-${rule.fact_id}`}>
                          Quy tắc chuẩn
                        </Badge>
                      )}
                      {pendingInfo && (
                        <Badge color="yellow" variant="filled" data-testid={`pending-proposal-badge-${rule.fact_id}`}>
                          Có đề xuất chờ duyệt
                        </Badge>
                      )}
                      {isIneligible && (
                        <Badge color="gray" variant="outline" data-testid={`ineligible-badge-${rule.fact_id}`}>
                          Không thuộc thiết lập M0 (Chỉ đọc)
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      Mã Fact: {rule.fact_id} · Brain v{brainVersion}
                    </Text>
                  </div>
                  <Group gap="xs">
                    {!isIneligible && (
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => openHistory(rule.fact_id)}
                        data-testid={`history-btn-${rule.fact_id}`}
                      >
                        Lịch sử & Phả hệ
                      </Button>
                    )}
                    {/* Action button: gated by M0 active, eligibility, and no pending (UXF-01, UXF-03) */}
                    {isM0Verified && !isIneligible && !historyErr && !pendingInfo && !isProposing && (
                      <Button
                        variant="light"
                        size="xs"
                        onClick={() => {
                          setActionSuccess('');
                          setProposingFactId(rule.fact_id);
                        }}
                        data-testid={`propose-btn-${rule.fact_id}`}
                      >
                        Đề xuất sửa quy tắc
                      </Button>
                    )}
                  </Group>
                </Group>

                {/* UXF-01: Inform user if rule is ineligible */}
                {isIneligible && (
                  <Alert color="gray" p="xs">
                    <Text size="xs">{ineligibleFacts[rule.fact_id]}</Text>
                  </Alert>
                )}

                {/* UXF-01: Show history error instead of swallowing */}
                {historyErr && (
                  <Alert color="orange" p="xs">
                    <Group justify="space-between">
                      <Text size="xs">Lỗi nạp trạng thái: {historyErr}</Text>
                      <Button size="compact-xs" variant="subtle" onClick={() => void reloadRules(true)}>
                        Thử lại
                      </Button>
                    </Group>
                  </Alert>
                )}

                {/* Canon Content */}
                <Card withBorder p="sm" bg="var(--mantine-color-gray-0)">
                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                    NỘI DUNG CANON ĐANG HIỆU LỰC:
                  </Text>
                  <Text
                    size="sm"
                    style={{ whiteSpace: 'pre-wrap' }}
                    data-testid={`canon-text-${rule.fact_id}`}
                  >
                    {rule.fact_value}
                  </Text>
                </Card>

                {/* Pending Proposal Decision Component (Strictly bound by Fact UUID) */}
                {pendingInfo && (
                  <PendingProposalDecisionView
                    novelId={novelId}
                    rule={rule}
                    proposal={pendingInfo.proposal}
                    brainVersion={brainVersion}
                    onRefreshLatest={async () => {
                      await reloadRules(true);
                    }}
                    onDecided={async (decision, message) => {
                      setActionSuccess(message);
                      await reloadRules(true);
                      onServerChange?.();
                    }}
                  />
                )}

                {/* Propose Amendment Form Inline (UXF-02) */}
                <Collapse in={isProposing}>
                  {isProposing && (
                    <ProposeAmendmentForm
                      novelId={novelId}
                      rule={rule}
                      brainVersion={brainVersion}
                      actor={actor}
                      onRefreshLatest={async () => {
                        await reloadRules(true);
                      }}
                      onSuccess={async (msg) => {
                        setProposingFactId(null);
                        setActionSuccess(msg);
                        await reloadRules(true);
                        onServerChange?.();
                      }}
                      onCancel={() => setProposingFactId(null)}
                    />
                  )}
                </Collapse>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      {/* History & Lineage Modal */}
      <Modal
        opened={!!historyFactId}
        onClose={() => {
          setHistoryFactId(null);
          setHistoryData(null);
        }}
        title={
          <Text fw={700}>
            Lịch sử hiệu chỉnh & Phả hệ quy tắc: {historyData?.fact_key ?? historyFactId}
          </Text>
        }
        size="lg"
      >
        {historyLoading && <Text size="sm">Đang tải phả hệ và lịch sử sửa đổi...</Text>}
        {historyError && (
          <Alert color="red" title="Lỗi đọc lịch sử">
            {historyError}
          </Alert>
        )}
        {historyData && (
          <Stack gap="md">
            <div>
              <Text size="xs" c="dimmed">
                Root Fact ID: {historyData.root_fact_id} · Head hiện hành: {historyData.effective_head_id}
              </Text>
              <Group gap="xs" mt={4}>
                <Badge color={historyData.is_locked ? 'red' : 'teal'}>
                  {historyData.is_locked ? 'Bất biến (Locked)' : 'Quy tắc chuẩn'}
                </Badge>
                <Badge variant="outline">Brain v{historyData.brain_version}</Badge>
              </Group>
            </div>

            <Divider label="Phả hệ các thế hệ Fact (Lineage)" labelPosition="center" />
            <ScrollArea h={180}>
              <Stack gap="xs">
                {historyData.lineage.map((item: WorldRuleLineageEntry, idx: number) => (
                  <Card withBorder key={item.fact_id} p="xs">
                    <Group justify="space-between" mb={2}>
                      <Text size="xs" fw={700}>
                        Thế hệ {idx + 1} {item.fact_id === historyData.effective_head_id ? '(HEAD)' : ''}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : ''}
                      </Text>
                    </Group>
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                      {item.fact_value}
                    </Text>
                    {item.supersedes_id && (
                      <Text size="10px" c="dimmed" mt={2}>
                        Kế nhiệm từ: {item.supersedes_id}
                      </Text>
                    )}
                  </Card>
                ))}
              </Stack>
            </ScrollArea>

            <Divider label="Nhật ký các đề xuất sửa đổi (Proposals)" labelPosition="center" />
            <ScrollArea h={220}>
              <Stack gap="xs">
                {historyData.proposals.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    Chưa có đề xuất chỉnh sửa nào trong lịch sử.
                  </Text>
                ) : (
                  historyData.proposals.map((item: WorldRuleAmendmentHistoryItem) => (
                    <Card withBorder key={item.proposal_id} p="xs">
                      <Group justify="space-between" mb={4}>
                        <Group gap="xs">
                          <Badge
                            size="xs"
                            color={
                              item.status === 'accepted'
                                ? 'green'
                                : item.status === 'rejected'
                                ? 'red'
                                : 'yellow'
                            }
                          >
                            {item.status === 'accepted'
                              ? 'ĐÃ DUYỆT'
                              : item.status === 'rejected'
                              ? 'ĐÃ LOẠI'
                              : 'CHỜ DUYỆT'}
                          </Badge>
                          <Text size="xs" fw={500}>
                            Đề xuất: {item.proposal_id.slice(0, 8)}...
                          </Text>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {item.decided_at ? new Date(item.decided_at).toLocaleString('vi-VN') : ''}
                        </Text>
                      </Group>
                      <Text size="xs" fw={600} c="dimmed">
                        Nội dung đề xuất:
                      </Text>
                      <Text size="xs" style={{ whiteSpace: 'pre-wrap' }} mb={4}>
                        {item.replacement_text}
                      </Text>
                      {item.reason && (
                        <Text size="xs" c="dimmed">
                          Lý do quyết định: {item.reason}
                        </Text>
                      )}
                      {item.successor_fact_id && (
                        <Text size="10px" c="teal">
                          Fact mới sinh: {item.successor_fact_id}
                        </Text>
                      )}
                    </Card>
                  ))
                )}
              </Stack>
            </ScrollArea>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

// ── Sub-component: Propose Amendment Form (UXF-02: Fingerprint-bound CAS & Idempotency) ──

interface ProposeFormProps {
  novelId: string;
  rule: WorldRuleFact;
  brainVersion: number;
  actor: string;
  onRefreshLatest: () => Promise<void>;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

function ProposeAmendmentForm({
  novelId,
  rule,
  brainVersion,
  actor,
  onRefreshLatest,
  onSuccess,
  onCancel,
}: ProposeFormProps) {
  const scope = usePlanningScope();
  const draftKey = `ephurin-planning:${actor}:${novelId}:amendment-proposal:${rule.fact_id}`;

  const draft = usePlanningDraft<ProposalDraft>(
    draftKey,
    {
      replacement_text: rule.fact_value,
      private_notes: '',
      expected_brain_version: brainVersion,
    },
    validProposalDraft
  );

  const { replacement_text, private_notes } = draft.value;
  const [currentExpectedVersion, setCurrentExpectedVersion] = useState<number>(brainVersion);
  const [submitting, setSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState('');
  const [is409Conflict, setIs409Conflict] = useState(false);
  const [is503Uncertain, setIs503Uncertain] = useState(false);

  // Sync expected brain version if parent changes
  useEffect(() => {
    setCurrentExpectedVersion(brainVersion);
  }, [brainVersion]);

  // Lock status notice
  const lockNotice = rule.is_locked
    ? 'Quy tắc này là BẤT BIẾN (LOCKED). Nội dung sửa đổi sẽ tự động kế thừa thuộc tính bất biến; không thể chuyển đổi trạng thái khóa.'
    : 'Quy tắc này là QUY TẮC CHUẨN. Thuộc tính khóa không thay đổi qua bản sửa.';

  // UXF-02: Rebase expected version on 409 while preserving author draft
  async function handleRebaseAndRetry() {
    setSubmitting(true);
    setError('');
    try {
      await onRefreshLatest();
      // Memory refreshed, error cleared, author text remains intact in draft
      setIs409Conflict(false);
    } catch (e) {
      setError(`Không thể làm mới phiên bản máy chủ: ${getApiErrorMessage(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  // UXF-02: Check server reconciliation on 503 / network timeout
  async function handleReconcileServer() {
    setReconciling(true);
    setError('');
    try {
      const h = await getWorldRuleAmendments(novelId, rule.fact_id, scope.signal);
      const matched = (h.proposals || []).find(
        (p) => p.status === 'pending' && p.replacement_text.trim() === replacement_text.trim()
      );
      if (matched) {
        draft.clear();
        onSuccess(
          `Máy chủ đã tiếp nhận đề xuất của bạn (Mã: ${matched.proposal_id.slice(0, 8)}...). Đã đồng bộ thành công!`
        );
        return;
      }
      setIs503Uncertain(false);
      setError('Máy chủ chưa ghi nhận đề xuất này. Bạn có thể bấm "Gửi đề xuất sửa" để thử lại an toàn.');
    } catch (e) {
      setError(`Không thể đối chiếu máy chủ: ${getApiErrorMessage(e)}`);
    } finally {
      setReconciling(false);
    }
  }

  async function handleSubmit() {
    if (!replacement_text.trim()) {
      setError('Nội dung quy tắc thay thế không được để trống.');
      return;
    }
    if (replacement_text.trim() === rule.fact_value.trim()) {
      setError('Nội dung sửa đổi phải khác với nội dung Canon hiện hành.');
      return;
    }

    scope.assertCurrent();
    const signal = scope.signal;
    setSubmitting(true);
    setError('');
    setIs409Conflict(false);
    setIs503Uncertain(false);

    // UXF-02: Compute fingerprint of payload without key.
    // draft.operationKey automatically preserves key on identical retries,
    // and generates a new key when replacement_text, private_notes, or expected version changes!
    const bodyForFingerprint = {
      novel_id: novelId,
      parent_fact_id: rule.fact_id,
      replacement_text: replacement_text.trim(),
      expected_brain_version: currentExpectedVersion,
      private_author_notes: private_notes.trim() ? [private_notes.trim()] : [],
    };
    const idempotencyKey = draft.operationKey(bodyForFingerprint);

    const body = {
      contract_version: 'setup-rule-amendment-v1' as const,
      idempotency_key: idempotencyKey,
      replacement_text: replacement_text.trim(),
      expected_brain_version: currentExpectedVersion,
      private_author_notes: private_notes.trim() ? [private_notes.trim()] : [],
    };

    try {
      await proposeWorldRuleAmendment(novelId, rule.fact_id, body, signal);
      if (!signal.aborted) {
        draft.clear();
        onSuccess(
          `Đã tạo đề xuất chỉnh sửa quy tắc ${rule.fact_key}. Vui lòng đối chiếu và xác nhận phê duyệt bên dưới.`
        );
      }
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof ApiClientError && e.status === 409) {
        setIs409Conflict(true);
        setError(
          `${getApiErrorMessage(e)}. Xung đột phiên bản bộ nhớ truyện (409): Dữ liệu vừa được cập nhật ở một phiên làm việc khác. Bản nháp của bạn được bảo toàn an toàn; vui lòng làm mới phiên bản máy chủ trước khi gửi lại.`
        );
      } else if (e instanceof ApiClientError && (e.status === 503 || e.status === 504)) {
        setIs503Uncertain(true);
        setError(
          `${getApiErrorMessage(e)}. Kết nối gián đoạn (${e.status}). Yêu cầu có thể đã được máy chủ tiếp nhận; vui lòng kiểm tra đồng bộ trước khi gửi lại.`
        );
      } else {
        setError(getApiErrorMessage(e));
      }
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  }

  return (
    <Card withBorder p="md" mt="xs" bg="var(--mantine-color-blue-0)">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700} c="blue">
            Đề xuất chỉnh sửa quy tắc: {rule.fact_key}
          </Text>
          <Badge size="xs" variant="outline">
            Fact: {rule.fact_id.slice(0, 8)}... · Brain v{currentExpectedVersion}
          </Badge>
        </Group>

        <Alert color={rule.is_locked ? 'red' : 'blue'} p="xs">
          <Text size="xs">{lockNotice}</Text>
        </Alert>

        {draft.backup && (
          <Alert color="orange" title="Có bản nháp đề xuất trên thiết bị">
            <Group gap="xs">
              <Button size="xs" onClick={draft.recover}>
                Khôi phục bản nháp
              </Button>
              <Button size="xs" variant="default" onClick={draft.clear}>
                Bỏ bản nháp
              </Button>
            </Group>
          </Alert>
        )}

        <Textarea
          label="Nội dung quy tắc thay thế (Replacement Text)"
          description="Nội dung mới sẽ thay thế bản Canon hiện hành sau khi được bạn chấp thuận."
          value={replacement_text}
          disabled={submitting}
          minRows={4}
          required
          onChange={(e) => draft.edit({ replacement_text: e.currentTarget.value })}
          data-testid="amendment-replacement-input"
        />

        <TextInput
          label="Ghi chú riêng của tác giả (Tùy chọn)"
          description="Ghi chú này được lưu trong biên nhận kiểm toán (receipt), không đưa vào văn bản truyện."
          placeholder="Lý do điều chỉnh quy tắc..."
          value={private_notes}
          disabled={submitting}
          onChange={(e) => draft.edit({ private_notes: e.currentTarget.value })}
          data-testid="amendment-notes-input"
        />

        {error && (
          <Alert color="red" role="alert">
            <Text size="xs">{error}</Text>
            {/* UXF-02: Actionable Rebase on 409 */}
            {is409Conflict && (
              <Group mt="xs">
                <Button
                  size="xs"
                  color="orange"
                  onClick={handleRebaseAndRetry}
                  loading={submitting}
                  data-testid="rebase-retry-btn"
                >
                  Làm mới phiên bản máy chủ & Giữ bản nháp
                </Button>
              </Group>
            )}
            {/* UXF-02: Actionable Reconcile on 503 */}
            {is503Uncertain && (
              <Group mt="xs" gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  onClick={handleReconcileServer}
                  loading={reconciling}
                  data-testid="reconcile-server-btn"
                >
                  Kiểm tra đồng bộ máy chủ
                </Button>
                <Button
                  size="xs"
                  color="blue"
                  onClick={handleSubmit}
                  loading={submitting}
                  data-testid="safe-retry-btn"
                >
                  Thử gửi lại an toàn
                </Button>
              </Group>
            )}
          </Alert>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onCancel} disabled={submitting}>
            Hủy
          </Button>
          <Button
            color="blue"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!replacement_text.trim()}
            data-testid="amendment-submit-proposal-btn"
          >
            Gửi đề xuất sửa
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

// ── Sub-component: Pending Proposal Decision View (UXF-02: Fingerprint-bound CAS) ──

interface PendingDecisionProps {
  novelId: string;
  rule: WorldRuleFact;
  proposal: WorldRuleAmendmentHistoryItem;
  brainVersion: number;
  onRefreshLatest: () => Promise<void>;
  onDecided: (decision: 'accept' | 'reject', message: string) => void;
}

function PendingProposalDecisionView({
  novelId,
  rule,
  proposal,
  brainVersion,
  onRefreshLatest,
  onDecided,
}: PendingDecisionProps) {
  const scope = usePlanningScope();
  const actor = useAuthStore((s) => s.user?.userId ?? 'guest');
  const draftKey = `ephurin-planning:${actor}:${novelId}:amendment-decision:${proposal.proposal_id}`;

  const draft = usePlanningDraft<DecisionDraft>(
    draftKey,
    {
      reason: '',
      expected_brain_version: brainVersion,
    },
    validDecisionDraft
  );

  const { reason } = draft.value;
  const [currentExpectedVersion, setCurrentExpectedVersion] = useState<number>(brainVersion);
  const [deciding, setDeciding] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState('');
  const [is409Conflict, setIs409Conflict] = useState(false);
  const [is503Uncertain, setIs503Uncertain] = useState(false);

  useEffect(() => {
    setCurrentExpectedVersion(brainVersion);
  }, [brainVersion]);

  // UXF-02: Rebase on 409
  async function handleRebaseAndRetry() {
    setDeciding(true);
    setError('');
    try {
      await onRefreshLatest();
      setIs409Conflict(false);
    } catch (e) {
      setError(`Không thể làm mới phiên bản máy chủ: ${getApiErrorMessage(e)}`);
    } finally {
      setDeciding(false);
    }
  }

  // UXF-02: Check server reconciliation on 503
  async function handleReconcileDecision() {
    setReconciling(true);
    setError('');
    try {
      const h = await getWorldRuleAmendments(novelId, rule.fact_id, scope.signal);
      const target = (h.proposals || []).find((p) => p.proposal_id === proposal.proposal_id);
      if (target && target.status !== 'pending') {
        draft.clear();
        onDecided(
          target.status as 'accept' | 'reject',
          `Quyết định cho đề xuất đã được máy chủ ghi nhận trạng thái: ${target.status}. Đã đồng bộ thành công!`
        );
        return;
      }
      setIs503Uncertain(false);
      setError('Máy chủ chưa ghi nhận quyết định. Bạn có thể chọn phê duyệt hoặc từ chối lại.');
    } catch (e) {
      setError(`Không thể đối chiếu máy chủ: ${getApiErrorMessage(e)}`);
    } finally {
      setReconciling(false);
    }
  }

  async function handleDecision(decision: 'accept' | 'reject') {
    scope.assertCurrent();
    const signal = scope.signal;
    setDeciding(true);
    setError('');
    setIs409Conflict(false);
    setIs503Uncertain(false);

    // UXF-02: Distinct fingerprint and operation key for accept vs reject and per reason change
    const bodyForFingerprint = {
      novel_id: novelId,
      proposal_id: proposal.proposal_id,
      decision,
      expected_brain_version: currentExpectedVersion,
      reason: reason.trim() || undefined,
    };
    const idempotencyKey = draft.operationKey(bodyForFingerprint);

    const body = {
      contract_version: 'setup-rule-amendment-v1' as const,
      idempotency_key: idempotencyKey,
      decision,
      expected_brain_version: currentExpectedVersion,
      reason: reason.trim() ? reason.trim() : undefined,
    };

    try {
      const resp = await decideWorldRuleAmendment(novelId, proposal.proposal_id, body, signal);
      if (!signal.aborted) {
        draft.clear();
        if (resp.decision === 'accept') {
          onDecided(
            'accept',
            `Đã chấp thuận đề xuất sửa đổi quy tắc ${rule.fact_key}. Fact mới đã trở thành Canon (Brain v${resp.brain_version}).`
          );
        } else {
          onDecided(
            'reject',
            `Đã từ chối đề xuất sửa đổi. Bản Canon cũ của quy tắc ${rule.fact_key} được bảo toàn nguyên vẹn.`
          );
        }
      }
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof ApiClientError && e.status === 409) {
        setIs409Conflict(true);
        setError(
          `${getApiErrorMessage(e)}. Xung đột phiên bản bộ nhớ truyện (409): Trạng thái đã thay đổi ở một phiên làm việc khác. Bản sửa được bảo lưu; vui lòng làm mới phiên bản máy chủ trước khi gửi lại.`
        );
      } else if (e instanceof ApiClientError && (e.status === 503 || e.status === 504)) {
        setIs503Uncertain(true);
        setError(
          `${getApiErrorMessage(e)}. Kết nối gián đoạn (${e.status}). Quyết định có thể đã được tiếp nhận; vui lòng kiểm tra đồng bộ máy chủ.`
        );
      } else {
        setError(getApiErrorMessage(e));
      }
    } finally {
      if (!signal.aborted) setDeciding(false);
    }
  }

  return (
    <Card
      withBorder
      p="md"
      mt="xs"
      bg="var(--mantine-color-yellow-0)"
      data-testid={`pending-decision-card-${rule.fact_id}`}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <Badge color="yellow" variant="filled">
              ĐỀ XUẤT CHỜ DUYỆT
            </Badge>
            <Text fw={700} size="sm">
              Mã đề xuất: {proposal.proposal_id.slice(0, 8)}...
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Brain v{currentExpectedVersion} · Fact: {rule.fact_id.slice(0, 8)}...
          </Text>
        </Group>

        {/* Before / After Comparison */}
        <Group grow align="stretch">
          <Card withBorder p="xs" bg="white">
            <Badge size="xs" color="gray" variant="light" mb={4}>
              TRƯỚC (Bản Canon đang hiệu lực)
            </Badge>
            <Text
              size="xs"
              style={{ whiteSpace: 'pre-wrap' }}
              data-testid={`comparison-before-text-${rule.fact_id}`}
            >
              {rule.fact_value}
            </Text>
          </Card>
          <Card withBorder p="xs" bg="var(--mantine-color-teal-0)">
            <Badge size="xs" color="teal" variant="filled" mb={4}>
              SAU (Bản đề xuất sửa đổi mới)
            </Badge>
            <Text
              size="xs"
              fw={500}
              style={{ whiteSpace: 'pre-wrap' }}
              data-testid={`comparison-after-text-${rule.fact_id}`}
            >
              {proposal.replacement_text}
            </Text>
          </Card>
        </Group>

        <TextInput
          label="Lý do phê duyệt hoặc từ chối (Tùy chọn)"
          placeholder="Ghi chú lý do vào biên nhận kiểm toán..."
          value={reason}
          disabled={deciding}
          onChange={(e) => draft.edit({ reason: e.currentTarget.value })}
          data-testid={`decision-reason-input-${rule.fact_id}`}
        />

        {error && (
          <Alert color="red" role="alert">
            <Text size="xs">{error}</Text>
            {is409Conflict && (
              <Group mt="xs">
                <Button
                  size="xs"
                  color="orange"
                  onClick={handleRebaseAndRetry}
                  loading={deciding}
                  data-testid="decision-rebase-btn"
                >
                  Làm mới phiên bản máy chủ & Thử lại
                </Button>
              </Group>
            )}
            {is503Uncertain && (
              <Group mt="xs">
                <Button
                  size="xs"
                  variant="light"
                  onClick={handleReconcileDecision}
                  loading={reconciling}
                  data-testid="decision-reconcile-btn"
                >
                  Kiểm tra đồng bộ máy chủ
                </Button>
              </Group>
            )}
          </Alert>
        )}

        <Group justify="flex-end" gap="xs">
          <Button
            color="red"
            variant="subtle"
            onClick={() => handleDecision('reject')}
            loading={deciding}
            data-testid={`reject-amendment-btn-${rule.fact_id}`}
          >
            Từ chối đề xuất
          </Button>
          <Button
            color="green"
            onClick={() => handleDecision('accept')}
            loading={deciding}
            data-testid={`accept-amendment-btn-${rule.fact_id}`}
          >
            Chấp thuận (Duyệt thành Canon mới)
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
