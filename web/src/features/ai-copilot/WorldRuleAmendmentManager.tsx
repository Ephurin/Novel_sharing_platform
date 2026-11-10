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

export type ReloadResult =
  | {
      ok: true;
      brainVersion: number;
      rules: WorldRuleFact[];
      memStatus: string;
      pendingProposalsByFactId: Record<
        string,
        { proposal: WorldRuleAmendmentHistoryItem; history: WorldRuleAmendmentHistory }
      >;
      ineligibleFacts: Record<string, string>;
      historyErrors: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
    };

export interface PreservedProposalDraft {
  id: string;
  novelId: string;
  factId: string;
  rootFactId?: string;
  factKey: string;
  replacement_text: string;
  private_notes: string;
  expected_brain_version: number;
  savedAt: string;
}

export interface PreservedDecisionDraft {
  id: string;
  novelId: string;
  proposalId: string;
  factId: string;
  rootFactId?: string;
  factKey: string;
  decision: 'accept' | 'reject';
  reason: string;
  savedAt: string;
}

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

function getPreservedProposalDraftsKey(novelId: string, actor: string) {
  return `ephurin-planning:${actor}:${novelId}:preserved-proposal-drafts-v1`;
}

function getPreservedDecisionDraftsKey(novelId: string, actor: string) {
  return `ephurin-planning:${actor}:${novelId}:preserved-decision-drafts-v1`;
}

function loadPreservedProposalDrafts(novelId: string, actor: string): PreservedProposalDraft[] {
  try {
    const raw = localStorage.getItem(getPreservedProposalDraftsKey(novelId, actor));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePreservedProposalDrafts(novelId: string, actor: string, items: PreservedProposalDraft[]) {
  try {
    localStorage.setItem(getPreservedProposalDraftsKey(novelId, actor), JSON.stringify(items));
  } catch {}
}

function loadPreservedDecisionDrafts(novelId: string, actor: string): PreservedDecisionDraft[] {
  try {
    const raw = localStorage.getItem(getPreservedDecisionDraftsKey(novelId, actor));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePreservedDecisionDrafts(novelId: string, actor: string, items: PreservedDecisionDraft[]) {
  try {
    localStorage.setItem(getPreservedDecisionDraftsKey(novelId, actor), JSON.stringify(items));
  } catch {}
}

function downloadJsonFile(filename: string, data: unknown) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleCopyText(text: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  } catch {}
}

function matchesPreservedDraft(rule: WorldRuleFact, draft: { factId: string; rootFactId?: string }) {
  if (draft.factId === rule.fact_id) return true;
  if (draft.rootFactId && rule.root_fact_id && draft.rootFactId === rule.root_fact_id) return true;
  if (rule.supersedes_id && rule.supersedes_id === draft.factId) return true;
  return false;
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

  // UXF-02d: Preserved drafts across proposal and decision workflows
  const [preservedProposals, setPreservedProposals] = useState<PreservedProposalDraft[]>(() =>
    loadPreservedProposalDrafts(novelId, actor)
  );
  const [preservedDecisions, setPreservedDecisions] = useState<PreservedDecisionDraft[]>(() =>
    loadPreservedDecisionDrafts(novelId, actor)
  );
  const [draftOverrides, setDraftOverrides] = useState<
    Record<string, { replacement_text: string; private_notes: string }>
  >({});

  useEffect(() => {
    setPreservedProposals(loadPreservedProposalDrafts(novelId, actor));
    setPreservedDecisions(loadPreservedDecisionDrafts(novelId, actor));
  }, [novelId, actor]);

  const handlePreserveProposal = (draft: PreservedProposalDraft) => {
    setPreservedProposals((prev) => {
      const filtered = prev.filter(
        (p) => p.factId !== draft.factId && (!draft.rootFactId || p.rootFactId !== draft.rootFactId)
      );
      const updated = [draft, ...filtered];
      savePreservedProposalDrafts(novelId, actor, updated);
      return updated;
    });
  };

  const handleDiscardPreservedProposal = (id: string) => {
    setPreservedProposals((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      savePreservedProposalDrafts(novelId, actor, updated);
      return updated;
    });
  };

  const handlePreserveDecision = (draft: PreservedDecisionDraft) => {
    setPreservedDecisions((prev) => {
      const filtered = prev.filter((d) => d.proposalId !== draft.proposalId);
      const updated = [draft, ...filtered];
      savePreservedDecisionDrafts(novelId, actor, updated);
      return updated;
    });
  };

  const handleDiscardPreservedDecision = (id: string) => {
    setPreservedDecisions((prev) => {
      const updated = prev.filter((d) => d.id !== id);
      savePreservedDecisionDrafts(novelId, actor, updated);
      return updated;
    });
  };

  const handleApplyPreservedDraftToPropose = (factId: string, draft: PreservedProposalDraft) => {
    setDraftOverrides((prev) => ({
      ...prev,
      [factId]: {
        replacement_text: draft.replacement_text,
        private_notes: draft.private_notes,
      },
    }));
    setProposingFactId(factId);
  };

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

  // Reload approved memory to get current effective World Rules (UXF-02b: return verified ReloadResult)
  async function reloadRules(silent = false): Promise<ReloadResult> {
    if (!silent) setLoading(true);
    setGeneralError('');
    try {
      const mem = await getApprovedMemory(novelId);
      if (!isMounted.current) {
        return { ok: false, error: 'Component unmounted' };
      }
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
            r.root_fact_id = h.root_fact_id;
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

      return {
        ok: true,
        brainVersion: mem.brain_version,
        rules: effectiveRules,
        memStatus: mem.status || 'draft',
        pendingProposalsByFactId: newPendingMap,
        ineligibleFacts: newIneligibleMap,
        historyErrors: newErrorsMap,
      };
    } catch (e) {
      const errorMsg = getApiErrorMessage(e);
      if (isMounted.current) {
        if (e instanceof ApiClientError && e.status === 404) {
          setRules([]);
          setMemStatus('draft');
        } else {
          setGeneralError(errorMsg);
        }
      }
      return { ok: false, error: errorMsg };
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

          // UXF-02d: Query preserved drafts matching this rule's immutable identity / lineage
          const matchingPreservedProposals = preservedProposals.filter((p) =>
            matchesPreservedDraft(rule, p)
          );
          const matchingPreservedDecisions = preservedDecisions.filter((d) =>
            matchesPreservedDraft(rule, d)
          );

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

                {/* UXF-02d: Visually Surface Preserved Proposal Drafts for User Recovery */}
                {matchingPreservedProposals.map((pDraft) => (
                  <Alert
                    key={pDraft.id}
                    color="violet"
                    title="Bản nháp đề xuất đã được bảo lưu (Chưa gửi)"
                    data-testid={`preserved-proposal-alert-${rule.fact_id}`}
                  >
                    <Stack gap="xs">
                      <div>
                        <Text size="xs" fw={700} c="violet.9">
                          Nội dung bản nháp đã lưu:
                        </Text>
                        <Text
                          size="sm"
                          style={{ whiteSpace: 'pre-wrap' }}
                          data-testid={`preserved-draft-text-${rule.fact_id}`}
                        >
                          {pDraft.replacement_text}
                        </Text>
                        {pDraft.private_notes && (
                          <Text
                            size="xs"
                            c="dimmed"
                            mt={4}
                            data-testid={`preserved-draft-notes-${rule.fact_id}`}
                          >
                            Ghi chú riêng: {pDraft.private_notes}
                          </Text>
                        )}
                        <Text size="10px" c="dimmed" mt={4}>
                          Được lưu tự động khi bạn xác nhận yêu cầu trước đó.
                        </Text>
                      </div>

                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          color="violet"
                          onClick={() =>
                            downloadJsonFile(`ban-nhap-de-xuat-${pDraft.factKey}.json`, pDraft)
                          }
                          data-testid={`export-preserved-draft-btn-${rule.fact_id}`}
                        >
                          Tải về bản nháp (.json)
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => void handleCopyText(pDraft.replacement_text)}
                          data-testid={`copy-preserved-draft-btn-${rule.fact_id}`}
                        >
                          Sao chép nội dung
                        </Button>
                        {!pendingInfo && isM0Verified && !isIneligible && !isProposing && (
                          <Button
                            size="xs"
                            color="teal"
                            onClick={() => handleApplyPreservedDraftToPropose(rule.fact_id, pDraft)}
                            data-testid={`apply-preserved-draft-btn-${rule.fact_id}`}
                          >
                            Đưa vào ô đề xuất sửa
                          </Button>
                        )}
                        <Button
                          size="xs"
                          color="gray"
                          variant="subtle"
                          onClick={() => handleDiscardPreservedProposal(pDraft.id)}
                          data-testid={`discard-preserved-draft-btn-${rule.fact_id}`}
                        >
                          Bỏ bản nháp
                        </Button>
                      </Group>
                    </Stack>
                  </Alert>
                ))}

                {/* UXF-02d: Visually Surface Preserved Decision Drafts for User Recovery */}
                {matchingPreservedDecisions.map((dDraft) => (
                  <Alert
                    key={dDraft.id}
                    color="violet"
                    title="Ghi chú lý do quyết định đã được bảo lưu (Chưa gửi)"
                    data-testid={`preserved-decision-alert-${rule.fact_id}`}
                  >
                    <Stack gap="xs">
                      <div>
                        <Text size="xs" fw={700} c="violet.9">
                          Ghi chú lý do đã lưu:
                        </Text>
                        <Text
                          size="sm"
                          style={{ whiteSpace: 'pre-wrap' }}
                          data-testid={`preserved-decision-reason-${rule.fact_id}`}
                        >
                          {dDraft.reason}
                        </Text>
                        <Text size="10px" c="dimmed" mt={4}>
                          Được lưu tự động khi bạn xác nhận quyết định trước đó ({dDraft.decision === 'accept' ? 'Chấp thuận' : 'Từ chối'}).
                        </Text>
                      </div>

                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          color="violet"
                          onClick={() =>
                            downloadJsonFile(`ban-nhap-ly-do-${dDraft.factKey}.json`, dDraft)
                          }
                          data-testid={`export-preserved-decision-btn-${rule.fact_id}`}
                        >
                          Tải về ghi chú (.json)
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => void handleCopyText(dDraft.reason)}
                          data-testid={`copy-preserved-decision-btn-${rule.fact_id}`}
                        >
                          Sao chép lý do
                        </Button>
                        <Button
                          size="xs"
                          color="gray"
                          variant="subtle"
                          onClick={() => handleDiscardPreservedDecision(dDraft.id)}
                          data-testid={`discard-preserved-decision-btn-${rule.fact_id}`}
                        >
                          Bỏ ghi chú
                        </Button>
                      </Group>
                    </Stack>
                  </Alert>
                ))}

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
                    onRefreshLatest={() => reloadRules(true)}
                    onDecided={async (decision, message) => {
                      setActionSuccess(message);
                      await reloadRules(true);
                      onServerChange?.();
                    }}
                    onPreserveDecision={handlePreserveDecision}
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
                      onRefreshLatest={() => reloadRules(true)}
                      onSuccess={async (msg) => {
                        setProposingFactId(null);
                        setActionSuccess(msg);
                        await reloadRules(true);
                        onServerChange?.();
                      }}
                      onCancel={() => setProposingFactId(null)}
                      onPreserveDraft={handlePreserveProposal}
                      initialDraftOverride={draftOverrides[rule.fact_id]}
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

interface SubmittedProposeRequest {
  novelId: string;
  factId: string;
  replacement_text: string;
  private_notes: string;
  expected_brain_version: number;
  idempotency_key: string;
}

interface ProposeFormProps {
  novelId: string;
  rule: WorldRuleFact;
  brainVersion: number;
  actor: string;
  onRefreshLatest: () => Promise<ReloadResult>;
  onSuccess: (message: string) => void;
  onCancel: () => void;
  onPreserveDraft?: (draft: PreservedProposalDraft) => void;
  initialDraftOverride?: { replacement_text: string; private_notes: string };
}

function ProposeAmendmentForm({
  novelId,
  rule,
  brainVersion,
  actor,
  onRefreshLatest,
  onSuccess,
  onCancel,
  onPreserveDraft,
  initialDraftOverride,
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
  const [hasEditedDraftConflict, setHasEditedDraftConflict] = useState(false);

  // UXF-02a: Store immutable in-flight submitted request identity before dispatch
  const lastSubmittedRef = useRef<SubmittedProposeRequest | null>(null);

  // UXF-02d: Apply preserved draft override if user clicks "Đưa vào ô đề xuất sửa"
  useEffect(() => {
    if (initialDraftOverride) {
      draft.edit({
        replacement_text: initialDraftOverride.replacement_text,
        private_notes: initialDraftOverride.private_notes,
      });
    }
  }, [initialDraftOverride]);

  // Sync expected brain version if parent changes
  useEffect(() => {
    setCurrentExpectedVersion(brainVersion);
  }, [brainVersion]);

  // Lock status notice
  const lockNotice = rule.is_locked
    ? 'Quy tắc này là BẤT BIẾN (LOCKED). Nội dung sửa đổi sẽ tự động kế thừa thuộc tính bất biến; không thể chuyển đổi trạng thái khóa.'
    : 'Quy tắc này là QUY TẮC CHUẨN. Thuộc tính khóa không thay đổi qua bản sửa.';

  // UXF-02b: Rebase on 409 must confirm successful refresh of Brain version and target Fact
  async function handleRebaseAndRetry() {
    setSubmitting(true);
    setError('');
    try {
      const res = await onRefreshLatest();
      if (!res.ok) {
        // Refresh failed (e.g. GET /memory 503) -> DO NOT clear 409!
        setError(
          `Không thể làm mới phiên bản máy chủ (${res.error}). Cảnh báo xung đột 409 và bản nháp được giữ nguyên; vui lòng thử lại.`
        );
        return;
      }

      if (res.historyErrors[rule.fact_id]) {
        // History GET for target rule failed -> DO NOT clear 409!
        setError(
          `Không thể tải trạng thái quy tắc (${res.historyErrors[rule.fact_id]}). Cảnh báo xung đột 409 và bản nháp được giữ nguyên; vui lòng thử lại.`
        );
        return;
      }

      if (res.ineligibleFacts[rule.fact_id]) {
        setError(`Quy tắc không còn đủ điều kiện hiệu chỉnh: ${res.ineligibleFacts[rule.fact_id]}`);
        return;
      }

      const freshRule = res.rules.find((r) => r.fact_id === rule.fact_id);
      if (!freshRule) {
        setError('Quy tắc này không còn tồn tại trong bộ nhớ truyện máy chủ.');
        return;
      }

      // Confirmed fresh state
      setCurrentExpectedVersion(res.brainVersion);
      setIs409Conflict(false);
      setError('');
    } catch (e) {
      setError(`Không thể làm mới phiên bản máy chủ: ${getApiErrorMessage(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  // UXF-02a: Authoritative 503 reconciliation via preserved idempotent request
  async function handleReconcileServer() {
    if (!lastSubmittedRef.current) {
      setError('Chưa có thông tin yêu cầu trước đó để đối chiếu.');
      return;
    }
    const submitted = lastSubmittedRef.current;

    // Check if author modified the draft in the form since submitting
    const isEdited =
      replacement_text.trim() !== submitted.replacement_text ||
      private_notes.trim() !== submitted.private_notes;

    if (isEdited) {
      setHasEditedDraftConflict(true);
      setError(
        'Bản nháp đã được chỉnh sửa so với yêu cầu trước đó đang chờ xác định. Vui lòng bấm "Gửi đề xuất sửa" để gửi bản nháp mới với mã giao dịch mới, hoặc bấm "Xác nhận yêu cầu trước (Bảo lưu bản nháp mới)" để kiểm tra trạng thái yêu cầu cũ trên máy chủ mà không làm mất bản nháp hiện tại.'
      );
      return;
    }

    setReconciling(true);
    setError('');

    try {
      const body = {
        contract_version: 'setup-rule-amendment-v1' as const,
        idempotency_key: submitted.idempotency_key,
        replacement_text: submitted.replacement_text,
        expected_brain_version: submitted.expected_brain_version,
        private_author_notes: submitted.private_notes ? [submitted.private_notes] : [],
      };

      await proposeWorldRuleAmendment(novelId, submitted.factId, body, scope.signal);
      draft.clear();
      lastSubmittedRef.current = null;
      setIs503Uncertain(false);
      setHasEditedDraftConflict(false);
      onSuccess(
        `Máy chủ đã tiếp nhận và xác thực thành công đề xuất của bạn (đối chiếu qua mã giao dịch). Đã đồng bộ an toàn!`
      );
    } catch (err: unknown) {
      if (err instanceof ApiClientError && (err.status === 503 || err.status === 504)) {
        setIs503Uncertain(true);
        setError(
          `Kết nối máy chủ vẫn gián đoạn (${err.status}). Kết quả chưa xác định (Ambiguous Outcome); bản nháp của bạn được bảo toàn an toàn.`
        );
      } else if (err instanceof ApiClientError && err.status === 409) {
        try {
          const h = await getWorldRuleAmendments(novelId, submitted.factId, scope.signal);
          const competingPending = (h.proposals || []).find((p) => p.status === 'pending');
          if (competingPending) {
            setIs503Uncertain(false);
            setIs409Conflict(true);
            setError(
              `Trạng thái chưa xác định: Máy chủ hiện có đề xuất chờ duyệt (Mã: ${competingPending.proposal_id.slice(0, 8)}...), nhưng không thể chứng minh đề xuất đó thuộc về yêu cầu này (có thể do phiên khác tạo). Bản nháp của bạn được bảo toàn an toàn.`
            );
            return;
          }
        } catch {
          // ignore
        }
        setIs409Conflict(true);
        setIs503Uncertain(false);
        setError(
          `${getApiErrorMessage(err)}. Xung đột phiên bản bộ nhớ truyện (409): Trạng thái máy chủ đã thay đổi. Bản nháp được giữ nguyên; vui lòng làm mới phiên bản máy chủ.`
        );
      } else {
        setError(`Không thể đối chiếu máy chủ: ${getApiErrorMessage(err)}`);
      }
    } finally {
      setReconciling(false);
    }
  }

  // UXF-02c: Explicit option to reconcile/confirm previous request A while preserving newly edited draft B
  async function handleReconcilePreviousPreservingDraft() {
    if (!lastSubmittedRef.current) {
      setError('Chưa có thông tin yêu cầu trước đó để xác nhận.');
      return;
    }
    const submitted = lastSubmittedRef.current;
    setReconciling(true);
    setError('');

    try {
      const body = {
        contract_version: 'setup-rule-amendment-v1' as const,
        idempotency_key: submitted.idempotency_key,
        replacement_text: submitted.replacement_text,
        expected_brain_version: submitted.expected_brain_version,
        private_author_notes: submitted.private_notes ? [submitted.private_notes] : [],
      };

      await proposeWorldRuleAmendment(novelId, submitted.factId, body, scope.signal);
      
      // UXF-02d: Register preserved draft with manager so it is immediately visible & actionable in UI!
      const preserved: PreservedProposalDraft = {
        id: crypto.randomUUID(),
        novelId,
        factId: rule.fact_id,
        rootFactId: rule.root_fact_id,
        factKey: rule.fact_key,
        replacement_text: replacement_text.trim(),
        private_notes: private_notes.trim(),
        expected_brain_version: currentExpectedVersion,
        savedAt: new Date().toISOString(),
      };
      onPreserveDraft?.(preserved);

      lastSubmittedRef.current = null;
      setIs503Uncertain(false);
      setHasEditedDraftConflict(false);
      onSuccess(
        `Máy chủ đã xác nhận yêu cầu trước đó (Nội dung cũ đã gửi) đã được tiếp nhận thành công. Bản nháp đã chỉnh sửa mới của bạn được hiển thị và bảo lưu an toàn bên dưới.`
      );
    } catch (err: unknown) {
      if (err instanceof ApiClientError && (err.status === 503 || err.status === 504)) {
        setIs503Uncertain(true);
        setError(
          `Kết nối máy chủ vẫn gián đoạn (${err.status}). Kết quả chưa xác định (Ambiguous Outcome); bản nháp mới của bạn vẫn được bảo toàn an toàn.`
        );
      } else if (err instanceof ApiClientError && err.status === 409) {
        setIs409Conflict(true);
        setIs503Uncertain(false);
        setError(
          `${getApiErrorMessage(err)}. Xung đột phiên bản bộ nhớ truyện (409): Trạng thái máy chủ đã thay đổi. Bản nháp mới của bạn được giữ nguyên.`
        );
      } else {
        setError(`Không thể xác nhận yêu cầu trước: ${getApiErrorMessage(err)}`);
      }
    } finally {
      setReconciling(false);
    }
  }

  // Safe retry using exact preserved idempotency key and submitted payload
  async function handleSafeRetry() {
    if (!lastSubmittedRef.current) {
      return handleSubmit();
    }
    const submitted = lastSubmittedRef.current;

    // UXF-02c: Compare normalized draft to submitted snapshot
    const isEdited =
      replacement_text.trim() !== submitted.replacement_text ||
      private_notes.trim() !== submitted.private_notes;

    if (isEdited) {
      // DO NOT submit request A and DO NOT clear draft B!
      setHasEditedDraftConflict(true);
      setError(
        'Bản nháp đã được chỉnh sửa so với yêu cầu trước đó đang chờ xác định (Nội dung nháp hiện tại khác với nội dung đã gửi). Thao tác "Thử gửi lại an toàn" bị chặn để bảo vệ bản nháp mới của bạn và không gửi nhầm nội dung cũ. Bạn có thể bấm "Gửi đề xuất sửa" để gửi bản nháp mới với mã giao dịch mới, hoặc chọn "Xác nhận yêu cầu trước (Bảo lưu bản nháp mới)".'
      );
      return;
    }

    scope.assertCurrent();
    const signal = scope.signal;
    setSubmitting(true);
    setError('');
    setHasEditedDraftConflict(false);

    const body = {
      contract_version: 'setup-rule-amendment-v1' as const,
      idempotency_key: submitted.idempotency_key,
      replacement_text: submitted.replacement_text,
      expected_brain_version: submitted.expected_brain_version,
      private_author_notes: submitted.private_notes ? [submitted.private_notes] : [],
    };

    try {
      await proposeWorldRuleAmendment(novelId, submitted.factId, body, signal);
      if (!signal.aborted) {
        draft.clear();
        lastSubmittedRef.current = null;
        setIs503Uncertain(false);
        setHasEditedDraftConflict(false);
        onSuccess(
          `Đã tạo đề xuất chỉnh sửa quy tắc ${rule.fact_key}. Vui lòng đối chiếu và xác nhận phê duyệt bên dưới.`
        );
      }
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof ApiClientError && (e.status === 503 || e.status === 504)) {
        setIs503Uncertain(true);
        setError(
          `${getApiErrorMessage(e)}. Kết nối vẫn bị gián đoạn (${e.status}). Trạng thái chưa xác định (Ambiguous Outcome); bản nháp của bạn được bảo toàn an toàn.`
        );
      } else if (e instanceof ApiClientError && e.status === 409) {
        setIs409Conflict(true);
        setIs503Uncertain(false);
        setError(
          `${getApiErrorMessage(e)}. Xung đột phiên bản bộ nhớ truyện (409): Dữ liệu vừa được cập nhật ở một phiên làm việc khác. Bản nháp của bạn được bảo toàn an toàn; vui lòng làm mới phiên bản máy chủ trước khi gửi lại.`
        );
      } else {
        setError(getApiErrorMessage(e));
      }
    } finally {
      if (!signal.aborted) setSubmitting(false);
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
    setHasEditedDraftConflict(false);

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

    const submitted: SubmittedProposeRequest = {
      novelId,
      factId: rule.fact_id,
      replacement_text: replacement_text.trim(),
      private_notes: private_notes.trim(),
      expected_brain_version: currentExpectedVersion,
      idempotency_key: idempotencyKey,
    };
    lastSubmittedRef.current = submitted;

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
        lastSubmittedRef.current = null;
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
                  onClick={handleSafeRetry}
                  loading={submitting}
                  data-testid="safe-retry-btn"
                >
                  Thử gửi lại an toàn
                </Button>
                {hasEditedDraftConflict && (
                  <Button
                    size="xs"
                    color="teal"
                    variant="outline"
                    onClick={handleReconcilePreviousPreservingDraft}
                    loading={reconciling}
                    data-testid="reconcile-preserve-draft-btn"
                  >
                    Xác nhận yêu cầu trước (Bảo lưu bản nháp mới)
                  </Button>
                )}
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

interface SubmittedDecisionRequest {
  novelId: string;
  proposalId: string;
  decision: 'accept' | 'reject';
  reason: string;
  expected_brain_version: number;
  idempotency_key: string;
}

interface PendingDecisionProps {
  novelId: string;
  rule: WorldRuleFact;
  proposal: WorldRuleAmendmentHistoryItem;
  brainVersion: number;
  onRefreshLatest: () => Promise<ReloadResult>;
  onDecided: (decision: 'accept' | 'reject', message: string) => void;
  onPreserveDecision?: (draft: PreservedDecisionDraft) => void;
}

function PendingProposalDecisionView({
  novelId,
  rule,
  proposal,
  brainVersion,
  onRefreshLatest,
  onDecided,
  onPreserveDecision,
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
  const [isCompetingConflict, setIsCompetingConflict] = useState(false);
  const [hasEditedDecisionConflict, setHasEditedDecisionConflict] = useState(false);
  const [refreshingCompeting, setRefreshingCompeting] = useState(false);

  // UXF-02a: Store immutable in-flight decision request identity before dispatch
  const lastSubmittedDecisionRef = useRef<SubmittedDecisionRequest | null>(null);

  useEffect(() => {
    setCurrentExpectedVersion(brainVersion);
  }, [brainVersion]);

  // UXF-02b: Rebase on 409 for Decision
  async function handleRebaseAndRetry() {
    setDeciding(true);
    setError('');
    try {
      const res = await onRefreshLatest();
      if (!res.ok) {
        setError(
          `Không thể làm mới phiên bản máy chủ (${res.error}). Cảnh báo xung đột 409 và quyết định được giữ nguyên; vui lòng thử lại.`
        );
        return;
      }

      if (res.historyErrors[rule.fact_id]) {
        setError(
          `Không thể tải trạng thái lịch sử đề xuất (${res.historyErrors[rule.fact_id]}). Cảnh báo xung đột 409 và quyết định được giữ nguyên; vui lòng thử lại.`
        );
        return;
      }

      const pendingInfo = res.pendingProposalsByFactId[rule.fact_id];
      if (!pendingInfo || pendingInfo.proposal.proposal_id !== proposal.proposal_id) {
        setError(
          'Đề xuất này không còn ở trạng thái chờ duyệt trên máy chủ (có thể đã được xử lý bởi phiên khác).'
        );
        return;
      }

      setCurrentExpectedVersion(res.brainVersion);
      setIs409Conflict(false);
      setError('');
    } catch (e) {
      setError(`Không thể làm mới phiên bản máy chủ: ${getApiErrorMessage(e)}`);
    } finally {
      setDeciding(false);
    }
  }

  // UXF-02a: Check server reconciliation on 503
  async function handleReconcileDecision() {
    if (!lastSubmittedDecisionRef.current) {
      setError('Chưa có thông tin quyết định trước đó để đối chiếu.');
      return;
    }
    const submitted = lastSubmittedDecisionRef.current;

    if (reason.trim() !== submitted.reason) {
      setHasEditedDecisionConflict(true);
      setError(
        'Lý do quyết định đã được chỉnh sửa so với yêu cầu trước đó đang chờ xác định. Vui lòng chọn lại Chấp thuận hoặc Từ chối để gửi quyết định mới, hoặc bấm "Xác nhận quyết định trước (Bảo lưu lý do mới)" để kiểm tra trạng thái quyết định cũ trên máy chủ mà không làm mất lý do hiện tại.'
      );
      return;
    }

    setReconciling(true);
    setError('');
    setIsCompetingConflict(false);

    try {
      const h = await getWorldRuleAmendments(novelId, rule.fact_id, scope.signal);
      const target = (h.proposals || []).find((p) => p.proposal_id === submitted.proposalId);

      if (!target) {
        setError('Không tìm thấy đề xuất này trong lịch sử máy chủ.');
        return;
      }

      if (target.status === 'pending') {
        // Proposal is still pending on server -> Previous attempt did not commit.
        // Safely replay with preserved idempotency key:
        const body = {
          contract_version: 'setup-rule-amendment-v1' as const,
          idempotency_key: submitted.idempotency_key,
          decision: submitted.decision,
          expected_brain_version: submitted.expected_brain_version,
          reason: submitted.reason ? submitted.reason : undefined,
        };
        const resp = await decideWorldRuleAmendment(novelId, submitted.proposalId, body, scope.signal);
        draft.clear();
        lastSubmittedDecisionRef.current = null;
        setIs503Uncertain(false);
        setHasEditedDecisionConflict(false);
        const actionLabel = submitted.decision === 'accept' ? 'chấp thuận' : 'từ chối';
        onDecided(
          submitted.decision,
          `Đã xác thực và ghi nhận thành công quyết định ${actionLabel} (Mã giao dịch hợp lệ). Đã đồng bộ thành công!`
        );
        return;
      }

      // Terminal status on server ('accepted' or 'rejected')
      const targetDecision = target.status === 'accepted' ? 'accept' : 'reject';
      const matchesDecision = targetDecision === submitted.decision;
      const matchesReason = (target.reason || '') === (submitted.reason || '');

      if (!matchesDecision || !matchesReason) {
        // COMPETING DECISION CONFLICT!
        setIsCompetingConflict(true);
        setIs503Uncertain(false);
        const targetStatusLabel = target.status === 'accepted' ? 'ĐÃ CHẤP THUẬN' : 'ĐÃ TỪ CHỐI';
        const myDecisionLabel = submitted.decision === 'accept' ? 'chấp thuận' : 'từ chối';
        setError(
          `Xung đột quyết định (Competing Decision): Đề xuất đã được quyết định bởi phiên làm việc khác với trạng thái "${targetStatusLabel}" (Lý do: "${target.reason || 'Không có'}"). Quyết định "${myDecisionLabel}" của bạn không thể áp dụng. Bản nháp quyết định được bảo toàn; vui lòng kiểm tra lại.`
        );
        return;
      }

      // Matches decision and reason: verify via idempotent replay to prove exact attribution
      const body = {
        contract_version: 'setup-rule-amendment-v1' as const,
        idempotency_key: submitted.idempotency_key,
        decision: submitted.decision,
        expected_brain_version: submitted.expected_brain_version,
        reason: submitted.reason ? submitted.reason : undefined,
      };
      await decideWorldRuleAmendment(novelId, submitted.proposalId, body, scope.signal);
      draft.clear();
      lastSubmittedDecisionRef.current = null;
      setIs503Uncertain(false);
      setHasEditedDecisionConflict(false);
      onDecided(
        submitted.decision,
        `Quyết định của bạn đã được máy chủ ghi nhận và xác thực chính xác qua mã giao dịch. Đã đồng bộ thành công!`
      );
    } catch (err: unknown) {
      if (err instanceof ApiClientError && (err.status === 503 || err.status === 504)) {
        setIs503Uncertain(true);
        setError(
          `Kết nối máy chủ vẫn gián đoạn (${err.status}). Kết quả chưa xác định (Ambiguous Outcome); bản nháp của bạn được bảo toàn an toàn.`
        );
      } else if (err instanceof ApiClientError && err.status === 409) {
        setIs409Conflict(true);
        setIs503Uncertain(false);
        setError(
          `${getApiErrorMessage(err)}. Xung đột phiên bản (409): Trạng thái đề xuất đã thay đổi trên máy chủ.`
        );
      } else {
        setError(`Không thể đối chiếu máy chủ: ${getApiErrorMessage(err)}`);
      }
    } finally {
      setReconciling(false);
    }
  }

  // UXF-02c: Explicit option to reconcile/confirm previous decision while preserving newly edited reason
  async function handleReconcilePreviousDecisionPreservingDraft() {
    if (!lastSubmittedDecisionRef.current) {
      setError('Chưa có thông tin quyết định trước đó để xác nhận.');
      return;
    }
    const submitted = lastSubmittedDecisionRef.current;
    setReconciling(true);
    setError('');

    try {
      const body = {
        contract_version: 'setup-rule-amendment-v1' as const,
        idempotency_key: submitted.idempotency_key,
        decision: submitted.decision,
        expected_brain_version: submitted.expected_brain_version,
        reason: submitted.reason ? submitted.reason : undefined,
      };

      await decideWorldRuleAmendment(novelId, submitted.proposalId, body, scope.signal);
      
      // UXF-02d: Register preserved decision draft with manager so it is immediately visible & actionable in UI!
      const preserved: PreservedDecisionDraft = {
        id: crypto.randomUUID(),
        novelId,
        proposalId: proposal.proposal_id,
        factId: rule.fact_id,
        rootFactId: rule.root_fact_id,
        factKey: rule.fact_key,
        decision: submitted.decision,
        reason: reason.trim(),
        savedAt: new Date().toISOString(),
      };
      onPreserveDecision?.(preserved);

      lastSubmittedDecisionRef.current = null;
      setIs503Uncertain(false);
      setHasEditedDecisionConflict(false);
      const actionLabel = submitted.decision === 'accept' ? 'chấp thuận' : 'từ chối';
      onDecided(
        submitted.decision,
        `Máy chủ đã xác nhận quyết định trước đó (${actionLabel} với lý do ban đầu) đã được tiếp nhận thành công. Ghi chú lý do mới của bạn được hiển thị và bảo lưu an toàn bên dưới.`
      );
    } catch (err: unknown) {
      if (err instanceof ApiClientError && (err.status === 503 || err.status === 504)) {
        setIs503Uncertain(true);
        setError(
          `Kết nối máy chủ vẫn gián đoạn (${err.status}). Kết quả chưa xác định (Ambiguous Outcome); ghi chú lý do mới của bạn vẫn được bảo toàn.`
        );
      } else if (err instanceof ApiClientError && err.status === 409) {
        setIs409Conflict(true);
        setIs503Uncertain(false);
        setError(
          `${getApiErrorMessage(err)}. Xung đột phiên bản bộ nhớ truyện (409): Trạng thái đề xuất đã thay đổi trên máy chủ.`
        );
      } else {
        setError(`Không thể xác nhận quyết định trước: ${getApiErrorMessage(err)}`);
      }
    } finally {
      setReconciling(false);
    }
  }

  // Safe retry using exact preserved submitted decision request
  async function handleSafeRetryDecision() {
    if (!lastSubmittedDecisionRef.current) {
      return handleDecision('accept');
    }
    const submitted = lastSubmittedDecisionRef.current;

    // UXF-02c: Compare normalized reason to submitted snapshot
    const isEdited = reason.trim() !== submitted.reason;
    if (isEdited) {
      setHasEditedDecisionConflict(true);
      setError(
        'Lý do quyết định đã được chỉnh sửa so với yêu cầu trước đó đang chờ xác định (Ghi chú lý do hiện tại khác với yêu cầu đã gửi). Thao tác "Thử gửi lại an toàn" bị chặn để bảo vệ ghi chú mới của bạn và không gửi nhầm lý do cũ. Vui lòng bấm "Chấp thuận" hoặc "Từ chối" để gửi quyết định với lý do mới, hoặc chọn "Xác nhận quyết định trước (Bảo lưu lý do mới)".'
      );
      return;
    }

    scope.assertCurrent();
    const signal = scope.signal;
    setDeciding(true);
    setError('');
    setHasEditedDecisionConflict(false);

    const body = {
      contract_version: 'setup-rule-amendment-v1' as const,
      idempotency_key: submitted.idempotency_key,
      decision: submitted.decision,
      expected_brain_version: submitted.expected_brain_version,
      reason: submitted.reason ? submitted.reason : undefined,
    };

    try {
      const resp = await decideWorldRuleAmendment(novelId, submitted.proposalId, body, signal);
      if (!signal.aborted) {
        draft.clear();
        lastSubmittedDecisionRef.current = null;
        setIs503Uncertain(false);
        setHasEditedDecisionConflict(false);
        const actionLabel = submitted.decision === 'accept' ? 'chấp thuận' : 'từ chối';
        onDecided(
          submitted.decision,
          `Đã ghi nhận thành công quyết định ${actionLabel} (Mã giao dịch hợp lệ).`
        );
      }
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof ApiClientError && (e.status === 503 || e.status === 504)) {
        setIs503Uncertain(true);
        setError(
          `${getApiErrorMessage(e)}. Kết nối vẫn bị gián đoạn (${e.status}). Trạng thái chưa xác định (Ambiguous Outcome); bản nháp được bảo toàn.`
        );
      } else if (e instanceof ApiClientError && e.status === 409) {
        setIs409Conflict(true);
        setIs503Uncertain(false);
        setError(
          `${getApiErrorMessage(e)}. Xung đột phiên bản bộ nhớ truyện (409): Đề xuất đã thay đổi trạng thái ở phiên khác.`
        );
      } else {
        setError(getApiErrorMessage(e));
      }
    } finally {
      if (!signal.aborted) setDeciding(false);
    }
  }

  async function handleDecision(decision: 'accept' | 'reject') {
    scope.assertCurrent();
    const signal = scope.signal;
    setDeciding(true);
    setError('');
    setIs409Conflict(false);
    setIs503Uncertain(false);
    setIsCompetingConflict(false);
    setHasEditedDecisionConflict(false);

    // UXF-02: Distinct fingerprint and operation key for accept vs reject and per reason change
    const bodyForFingerprint = {
      novel_id: novelId,
      proposal_id: proposal.proposal_id,
      decision,
      expected_brain_version: currentExpectedVersion,
      reason: reason.trim() || undefined,
    };
    const idempotencyKey = draft.operationKey(bodyForFingerprint);

    const submitted: SubmittedDecisionRequest = {
      novelId,
      proposalId: proposal.proposal_id,
      decision,
      reason: reason.trim(),
      expected_brain_version: currentExpectedVersion,
      idempotency_key: idempotencyKey,
    };
    lastSubmittedDecisionRef.current = submitted;

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
        lastSubmittedDecisionRef.current = null;
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

  async function handleRefreshCompeting() {
    setRefreshingCompeting(true);
    try {
      const res = await onRefreshLatest();
      if (!res.ok) {
        setError(
          `Không thể tải lại trạng thái đề xuất từ máy chủ (${res.error}). Cảnh báo xung đột quyết định và bản nháp được giữ nguyên; vui lòng thử lại.`
        );
        return;
      }

      if (res.historyErrors[rule.fact_id]) {
        setError(
          `Không thể tải lịch sử đề xuất (${res.historyErrors[rule.fact_id]}). Cảnh báo xung đột quyết định và bản nháp được giữ nguyên; vui lòng thử lại.`
        );
        return;
      }

      // Verified fresh state successfully loaded from server!
      setIsCompetingConflict(false);
      setError('');
    } catch (e) {
      setError(
        `Không thể tải lại trạng thái đề xuất: ${getApiErrorMessage(e)}. Cảnh báo xung đột quyết định và bản nháp được giữ nguyên.`
      );
    } finally {
      setRefreshingCompeting(false);
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
              <Group mt="xs" gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  onClick={handleReconcileDecision}
                  loading={reconciling}
                  data-testid="decision-reconcile-btn"
                >
                  Kiểm tra đồng bộ máy chủ
                </Button>
                <Button
                  size="xs"
                  color="blue"
                  onClick={handleSafeRetryDecision}
                  loading={deciding}
                  data-testid="safe-retry-decision-btn"
                >
                  Thử gửi lại an toàn
                </Button>
                {hasEditedDecisionConflict && (
                  <Button
                    size="xs"
                    color="teal"
                    variant="outline"
                    onClick={handleReconcilePreviousDecisionPreservingDraft}
                    loading={reconciling}
                    data-testid="decision-reconcile-preserve-draft-btn"
                  >
                    Xác nhận quyết định trước (Bảo lưu lý do mới)
                  </Button>
                )}
              </Group>
            )}
            {isCompetingConflict && (
              <Group mt="xs">
                <Button
                  size="xs"
                  color="orange"
                  variant="light"
                  onClick={handleRefreshCompeting}
                  loading={refreshingCompeting}
                  data-testid="competing-refresh-btn"
                >
                  Tải lại trạng thái đề xuất mới nhất
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
