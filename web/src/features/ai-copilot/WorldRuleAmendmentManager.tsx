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
};

type ProposalDraft = {
  replacement_text: string;
  private_notes: string;
  expected_brain_version: number;
  operation_key: string;
};

type DecisionDraft = {
  reason: string;
  expected_brain_version: number;
  operation_key: string;
};

function validProposalDraft(v: unknown): v is ProposalDraft {
  const d = v as ProposalDraft;
  return (
    !!d &&
    typeof d.replacement_text === 'string' &&
    typeof d.private_notes === 'string' &&
    Number.isInteger(d.expected_brain_version) &&
    typeof d.operation_key === 'string'
  );
}

function validDecisionDraft(v: unknown): v is DecisionDraft {
  const d = v as DecisionDraft;
  return (
    !!d &&
    typeof d.reason === 'string' &&
    Number.isInteger(d.expected_brain_version) &&
    typeof d.operation_key === 'string'
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
  onServerChange?: () => void;
  preloadedRules?: WorldRuleFact[];
}

export function WorldRuleAmendmentManager({
  novelId,
  brainVersion: initialBrainVersion,
  onServerChange,
  preloadedRules,
}: Props) {
  const scope = usePlanningScope();
  const actor = useAuthStore((s) => s.user?.userId ?? 'guest');

  const [rules, setRules] = useState<WorldRuleFact[]>(preloadedRules ?? []);
  const [brainVersion, setBrainVersion] = useState<number>(initialBrainVersion ?? 1);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Selected rule for proposing an amendment
  const [proposingFactId, setProposingFactId] = useState<string | null>(null);

  // Selected rule for viewing history / lineage
  const [historyFactId, setHistoryFactId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<WorldRuleAmendmentHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Active pending proposals map by fact_key: Map<fact_key, WorldRuleAmendmentHistoryItem>
  const [pendingProposalsByKey, setPendingProposalsByKey] = useState<
    Record<string, { proposal: WorldRuleAmendmentHistoryItem; history: WorldRuleAmendmentHistory }>
  >({});

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Reload approved memory to get current effective World Rules
  async function reloadRules(silent = false) {
    if (!silent) setLoading(true);
    setGeneralError('');
    try {
      const mem = await getApprovedMemory(novelId);
      if (!isMounted.current) return;
      setBrainVersion(mem.brain_version);

      const effectiveRules: WorldRuleFact[] = (mem.facts || [])
        .filter(
          (f: MemoryFact) =>
            f.fact_type === 'world_rule' ||
            (f.fact_key && f.fact_key.startsWith('world_rule')) ||
            (f.is_global === true && !f.subject_entity_id && !f.chapter_id)
        )
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

      // Check pending proposals for all rules
      const pendingMap: Record<
        string,
        { proposal: WorldRuleAmendmentHistoryItem; history: WorldRuleAmendmentHistory }
      > = {};

      await Promise.all(
        effectiveRules.map(async (r) => {
          try {
            const h = await getWorldRuleAmendments(novelId, r.fact_id, scope.signal);
            const pending = (h.proposals || []).find((p) => p.status === 'pending');
            if (pending) {
              pendingMap[r.fact_key] = { proposal: pending, history: h };
            }
          } catch {
            // Non-blocking history probe
          }
        })
      );

      if (isMounted.current) {
        setPendingProposalsByKey(pendingMap);
      }
    } catch (e) {
      if (!isMounted.current) return;
      if (e instanceof ApiClientError && e.status === 404) {
        // No story brain / memory yet
        setRules([]);
      } else {
        setGeneralError(getApiErrorMessage(e));
      }
    } finally {
      if (isMounted.current && !silent) setLoading(false);
    }
  }

  useEffect(() => {
    void reloadRules();
  }, [novelId]);

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

  const selectedRule = rules.find((r) => r.fact_id === proposingFactId);

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
            Chưa có quy tắc thế giới nào được phê duyệt sau mốc M0, hoặc thiết lập thế giới chưa được
            kích hoạt. Hãy hoàn tất duyệt và kích hoạt thiết lập M0 ở trên để bắt đầu quản lý.
          </Text>
        </Card>
      )}

      <Stack gap="sm">
        {rules.map((rule, idx) => {
          const pendingInfo = pendingProposalsByKey[rule.fact_key];
          const isProposing = proposingFactId === rule.fact_id;

          return (
            <Card withBorder key={rule.fact_id} p="md" shadow="xs" data-testid={`rule-card-${rule.fact_key}`}>
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Group gap="xs">
                      <Text fw={700}>
                        Quy tắc {idx + 1}: {rule.fact_key}
                      </Text>
                      {rule.is_locked ? (
                        <Badge color="red" variant="filled" data-testid="lock-badge-locked">
                          Bất biến (Locked)
                        </Badge>
                      ) : (
                        <Badge color="teal" variant="light" data-testid="lock-badge-standard">
                          Quy tắc chuẩn
                        </Badge>
                      )}
                      {pendingInfo && (
                        <Badge color="yellow" variant="filled" data-testid="pending-proposal-badge">
                          Có đề xuất chờ duyệt
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      Mã Fact: {rule.fact_id} · Brain v{brainVersion}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => openHistory(rule.fact_id)}
                      data-testid={`history-btn-${rule.fact_key}`}
                    >
                      Lịch sử & Phả hệ
                    </Button>
                    {!pendingInfo && !isProposing && (
                      <Button
                        variant="light"
                        size="xs"
                        onClick={() => {
                          setActionSuccess('');
                          setProposingFactId(rule.fact_id);
                        }}
                        data-testid={`propose-btn-${rule.fact_key}`}
                      >
                        Đề xuất sửa quy tắc
                      </Button>
                    )}
                  </Group>
                </Group>

                {/* Canon Content */}
                <Card withBorder p="sm" bg="var(--mantine-color-gray-0)">
                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                    NỘI DUNG CANON ĐANG HIỆU LỰC:
                  </Text>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} data-testid={`canon-text-${rule.fact_key}`}>
                    {rule.fact_value}
                  </Text>
                </Card>

                {/* Pending Proposal Decision Component */}
                {pendingInfo && (
                  <PendingProposalDecisionView
                    novelId={novelId}
                    rule={rule}
                    proposal={pendingInfo.proposal}
                    brainVersion={brainVersion}
                    onDecided={async (decision, message) => {
                      setActionSuccess(message);
                      await reloadRules(true);
                      onServerChange?.();
                    }}
                  />
                )}

                {/* Propose Amendment Form Inline */}
                <Collapse in={isProposing}>
                  {isProposing && (
                    <ProposeAmendmentForm
                      novelId={novelId}
                      rule={rule}
                      brainVersion={brainVersion}
                      actor={actor}
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

// ── Sub-component: Propose Amendment Form ────────────────────────────────────

interface ProposeFormProps {
  novelId: string;
  rule: WorldRuleFact;
  brainVersion: number;
  actor: string;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

function ProposeAmendmentForm({
  novelId,
  rule,
  brainVersion,
  actor,
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
      operation_key: crypto.randomUUID(),
    },
    validProposalDraft
  );

  const { replacement_text, private_notes } = draft.value;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Lock status notice
  const lockNotice = rule.is_locked
    ? 'Quy tắc này là BẤT BIẾN (LOCKED). Nội dung sửa đổi sẽ tự động kế thừa thuộc tính bất biến; không thể chuyển đổi trạng thái khóa.'
    : 'Quy tắc này là QUY TẮC CHUẨN. Thuộc tính khóa không thay đổi qua bản sửa.';

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

    const body = {
      contract_version: 'setup-rule-amendment-v1' as const,
      idempotency_key: draft.value.operation_key,
      replacement_text: replacement_text.trim(),
      expected_brain_version: brainVersion,
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
        setError(
          `${getApiErrorMessage(e)}. Xung đột phiên bản bộ nhớ truyện (409): Dữ liệu vừa được cập nhật ở một phiên làm việc khác. Bản nháp của bạn vẫn được lưu an toàn; vui lòng làm mới để đối chiếu trước khi gửi lại.`
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
            Idempotency: {draft.value.operation_key.slice(0, 8)}...
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
            {error}
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

// ── Sub-component: Pending Proposal Decision & Comparison View ──────────────

interface PendingDecisionProps {
  novelId: string;
  rule: WorldRuleFact;
  proposal: WorldRuleAmendmentHistoryItem;
  brainVersion: number;
  onDecided: (decision: 'accept' | 'reject', message: string) => void;
}

function PendingProposalDecisionView({
  novelId,
  rule,
  proposal,
  brainVersion,
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
      operation_key: crypto.randomUUID(),
    },
    validDecisionDraft
  );

  const { reason } = draft.value;
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState('');

  async function handleDecision(decision: 'accept' | 'reject') {
    scope.assertCurrent();
    const signal = scope.signal;
    setDeciding(true);
    setError('');

    const body = {
      contract_version: 'setup-rule-amendment-v1' as const,
      idempotency_key: draft.value.operation_key,
      decision,
      expected_brain_version: brainVersion,
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
        setError(
          `${getApiErrorMessage(e)}. Xung đột phiên bản bộ nhớ truyện (409): Trạng thái đã thay đổi ở một phiên làm việc khác. Bản sửa được bảo lưu; vui lòng làm mới để đối chiếu trước khi gửi lại.`
        );
      } else {
        setError(getApiErrorMessage(e));
      }
    } finally {
      if (!signal.aborted) setDeciding(false);
    }
  }

  return (
    <Card withBorder p="md" mt="xs" bg="var(--mantine-color-yellow-0)" data-testid="pending-decision-card">
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
            Brain v{brainVersion}
          </Text>
        </Group>

        {/* Before / After Comparison */}
        <Group grow align="stretch">
          <Card withBorder p="xs" bg="white">
            <Badge size="xs" color="gray" variant="light" mb={4}>
              TRƯỚC (Bản Canon đang hiệu lực)
            </Badge>
            <Text size="xs" style={{ whiteSpace: 'pre-wrap' }} data-testid="comparison-before-text">
              {rule.fact_value}
            </Text>
          </Card>
          <Card withBorder p="xs" bg="var(--mantine-color-teal-0)">
            <Badge size="xs" color="teal" variant="filled" mb={4}>
              SAU (Bản đề xuất sửa đổi mới)
            </Badge>
            <Text size="xs" fw={500} style={{ whiteSpace: 'pre-wrap' }} data-testid="comparison-after-text">
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
          data-testid="decision-reason-input"
        />

        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}

        <Group justify="flex-end" gap="xs">
          <Button
            color="red"
            variant="subtle"
            onClick={() => handleDecision('reject')}
            loading={deciding}
            data-testid="reject-amendment-btn"
          >
            Từ chối đề xuất
          </Button>
          <Button
            color="green"
            onClick={() => handleDecision('accept')}
            loading={deciding}
            data-testid="accept-amendment-btn"
          >
            Chấp thuận (Duyệt thành Canon mới)
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
