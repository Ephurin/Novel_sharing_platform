import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  Pagination,
  Paper,
  Radio,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconRefresh, IconUserCheck, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  type Decision,
  type EntityReview,
  type EntityType,
  type GuidanceData,
  type GuidanceEntry,
  type KnownEntity,
  getEntityGuidance,
  getEntityReviews,
  knownIdentity,
  memoryPost,
  newIdentity,
  refreshEntityReview,
  rejectOccurrence,
  saveEntityGuidance,
  saveEntityReview,
  continueEntityReview
} from './author-memory-api';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';

const ENTITY_TYPES: EntityType[] = ['PER', 'LOC', 'ORG', 'ITEM', 'SKILL'];
const STATUS_OPTIONS: Array<'Alive' | 'Dead' | 'Unknown'> = ['Alive', 'Dead', 'Unknown'];

const HUMAN_FIELDS: Array<keyof Decision> = [
  'verdict', 'canonical_entity_id', 'provisional_identity_key', 'canonical_name',
  'entity_type', 'initial_status', 'identity_quote', 'status_quote'
];
const sameHumanDecision = (a: Decision, b: Decision) => HUMAN_FIELDS.every(key => a[key] === b[key]);
const sameIdentity = (a: Decision, b: Decision) =>
  a.verdict === b.verdict && a.canonical_entity_id === b.canonical_entity_id &&
  a.provisional_identity_key === b.provisional_identity_key;

export function EntityExtractionReview({
  novelId,
  disabled,
  perform,
  onContinued
}: {
  novelId: string;
  disabled: boolean;
  perform: (fn: () => Promise<unknown>) => void;
  onContinued: () => Promise<unknown>;
}) {
  const guidance = useQuery<GuidanceData>({
    queryKey: ['entity-guidance', novelId],
    queryFn: () => getEntityGuidance(novelId),
    enabled: Boolean(novelId)
  });

  const reviews = useQuery<EntityReview[]>({
    queryKey: ['entity-reviews', novelId],
    queryFn: () => getEntityReviews(novelId),
    enabled: Boolean(novelId),
    refetchInterval: 3000
  });

  const [names, setNames] = useState('');
  const [dirty, setDirty] = useState(false);
  const [declaredName, setDeclaredName] = useState('');
  const [declaredType, setDeclaredType] = useState<EntityType | null>('PER');

  useEffect(() => {
    setDirty(false);
    setNames('');
    setDeclaredName('');
  }, [novelId]);

  useEffect(() => {
    if (!dirty && guidance.data) {
      setNames(
        guidance.data.entries
          .filter(e => e.kind === 'hint')
          .map(e => e.name)
          .join('\n')
      );
    }
  }, [guidance.data, dirty]);

  const refreshAll = async () => {
    await Promise.all([guidance.refetch(), reviews.refetch()]);
  };

  return (
    <Stack gap="md">
      {guidance.data && !guidance.data.chapter_review_enabled && (
        <Alert color="orange" title="Cấu hình trích xuất">
          Chế độ duyệt entity trước event/fact chưa bật trên server này. Danh sách vẫn được lưu;
          cần cấu hình kiểm thử hoặc bật tính năng để áp dụng cho extraction chương.
        </Alert>
      )}

      {/* ──────────────────────────────────────────
          Section 1: Guidance & Author Entity Declarations
         ────────────────────────────────────────── */}
      <Paper p="sm" withBorder radius="md">
        <Stack gap="xs">
          <Text fw={600} size="sm">
            1. Danh sách tăng cường &amp; Khai báo thế giới (Tùy chọn)
          </Text>
          <Text size="xs" c="dimmed">
            Gợi ý nhận diện khi phân tích chương. Tên trong danh sách hướng dẫn AI tìm kiếm,
            không tự động khẳng định nhân vật đã xuất hiện trong truyện.
          </Text>

          <Textarea
            label="Tên cần chú ý (mỗi dòng một tên)"
            placeholder="Ví dụ: Minh\nThái\nLâm Phong"
            value={names}
            onChange={e => {
              setNames(e.currentTarget.value);
              setDirty(true);
            }}
            autosize
            minRows={2}
            disabled={disabled}
          />

          <Group justify="flex-end">
            <Button
              size="xs"
              variant="light"
              disabled={disabled || !guidance.data}
              onClick={() =>
                perform(async () => {
                  const previous = new Map(guidance.data!.entries.map(e => [e.name, e]));
                  const entries: GuidanceEntry[] = names
                    .split('\n')
                    .map(n => n.trim())
                    .filter(Boolean)
                    .map(name => previous.get(name) ?? { name, kind: 'hint' });
                  entries.push(...guidance.data!.entries.filter(e => e.kind === 'declared'));

                  await saveEntityGuidance(novelId, {
                    expected_version: guidance.data!.version,
                    entries
                  });
                  setDirty(false);
                  await refreshAll();
                })
              }
            >
              Lưu danh sách tăng cường
            </Button>
          </Group>

          <Divider my="xs" />

          <Text size="xs" fw={500}>
            Khai báo thực thể thế giới (Tạo đề xuất duyệt độc lập, không khẳng định có trong chương)
          </Text>
          <Group align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              size="xs"
              label="Tên thực thể"
              placeholder="Ví dụ: Vạn Tiên Tông"
              value={declaredName}
              onChange={e => setDeclaredName(e.currentTarget.value)}
              disabled={disabled}
            />
            <Select
              style={{ width: 120 }}
              size="xs"
              label="Loại"
              data={ENTITY_TYPES}
              value={declaredType}
              onChange={v => setDeclaredType(v as EntityType)}
              disabled={disabled}
            />
            <Button
              size="xs"
              disabled={disabled || !declaredName.trim() || !declaredType}
              onClick={() =>
                perform(async () => {
                  await memoryPost(`/ai/story-brains/${novelId}/author-entities`, {
                    name: declaredName.trim(),
                    entity_type: declaredType
                  });
                  setDeclaredName('');
                  await refreshAll();
                })
              }
            >
              Khai báo thực thể
            </Button>
          </Group>
        </Stack>
      </Paper>

      {(guidance.error || reviews.error) && (
        <Alert color="red" title="Lỗi tải dữ liệu">
          {getApiErrorMessage(guidance.error ?? reviews.error)}
        </Alert>
      )}

      {/* ──────────────────────────────────────────
          Section 2: Checkpoint Review List
         ────────────────────────────────────────── */}
      <Stack gap="xs">
        <Text fw={600} size="sm">
          2. Duyệt danh tính — trước bước duyệt đề xuất Canon
        </Text>

        <Text size="xs" c="dimmed">
          Đây là checkpoint xác định mỗi lần xuất hiện thuộc danh tính nào, độc lập với số đề xuất Canon chờ duyệt.
          Freeze không thay thế bước duyệt event/fact và kích hoạt Story Brain.
        </Text>
        {reviews.data && reviews.data.length > 0 ? (
          reviews.data.map(review => (
            <EntityCheckpoint
              key={`${novelId}:${review.analysis_run_id}`}
              review={review}
              novelId={novelId}
              guidanceVersion={guidance.data?.version}
              disabled={disabled || dirty}
              perform={perform}
              onContinued={async () => {
                await refreshAll();
                await onContinued();
              }}
            />
          ))
        ) : (
          <Paper p="md" withBorder radius="md">
            <Text size="sm" c="dimmed" ta="center">
              Chưa có checkpoint chờ duyệt entity. Hãy lưu danh sách rồi trích xuất nội dung chương.
            </Text>
          </Paper>
        )}
      </Stack>
    </Stack>
  );
}

// ──────────────────────────────────────────────
// Checkpoint Occurrence Review Component
// ──────────────────────────────────────────────

function EntityCheckpoint({
  review,
  novelId,
  guidanceVersion,
  disabled,
  perform,
  onContinued
}: {
  review: EntityReview;
  novelId: string;
  guidanceVersion?: number;
  disabled: boolean;
  perform: (fn: () => Promise<unknown>) => void;
  onContinued: () => Promise<unknown>;
}) {
  const candidates = review.candidates ?? [];
  const machineDecisions = review.decisions ?? [];
  const reviewedDecisions = review.reviewed_decisions ?? [];
  const knownEntities = review.known_entities ?? [];
  const pendingIds = new Set(review.pending_candidate_ids ?? candidates.map(c => c.candidate_id));

  // Extract author provisional groups from server reviewed decisions
  const initialGroups = Array.from(
    new Set(
      reviewedDecisions
        .map(d => d.provisional_identity_key)
        .filter(Boolean)
        .map(k => (review.provisional_identity_scope ? k.replace(`${review.provisional_identity_scope}/`, '') : k))
        .filter(k => /^[A-Za-z0-9_-]{1,64}$/.test(k))
    )
  );

  const [authorGroups, setAuthorGroups] = useState<string[]>(initialGroups);
  const [newGroupInput, setNewGroupInput] = useState('');
  const [newGroupError, setNewGroupError] = useState('');

  // Track candidate IDs that the author has locally modified
  const [dirtyCandidateIds, setDirtyCandidateIds] = useState<Set<string>>(() => new Set());
  const dirtyCandidateIdsRef = useRef<Set<string>>(dirtyCandidateIds);
  useEffect(() => {
    dirtyCandidateIdsRef.current = dirtyCandidateIds;
  }, [dirtyCandidateIds]);

  // Local human choices state: preserved across version updates
  const [choices, setChoices] = useState<Record<string, Decision>>(() => {
    return Object.fromEntries(reviewedDecisions.map(d => [d.candidate_id, d]));
  });

  const choicesRef = useRef(choices);
  useEffect(() => { choicesRef.current = choices; }, [choices]);

  // Track conflict errors and version conflict notifications
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  // Filter state for occurrences: 'all' | 'pending' | 'resolved'
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'resolved'>('all');
  const [activePage, setActivePage] = useState(1);
  const pageSize = 5;

  // Stale guidance check
  const staleGuidance = guidanceVersion !== undefined && guidanceVersion !== review.guidance_version;

  // Reconcile server snapshots without overwriting local author drafts. Keep state updaters pure.
  useEffect(() => {
    const previous = choicesRef.current;
    const next = { ...previous };
    let hasConflict = false;
    for (const serverDecision of reviewedDecisions) {
      const id = serverDecision.candidate_id;
      if (!dirtyCandidateIdsRef.current.has(id)) next[id] = serverDecision;
      else if (previous[id] && !sameHumanDecision(previous[id], serverDecision)) hasConflict = true;
    }
    const currentIds = new Set(candidates.map(c => c.candidate_id));
    for (const id of Object.keys(next)) if (!currentIds.has(id)) delete next[id];
    setChoices(next);
    if (hasConflict) setConflictMessage(
      `Phiên bản trên máy chủ đã cập nhật (v${review.review_version}). Các lựa chọn chưa lưu của bạn vẫn được giữ nguyên. Vui lòng kiểm tra lại trước khi lưu.`
    );
    setAuthorGroups(previousGroups => Array.from(new Set([...previousGroups, ...initialGroups])));
  }, [review.review_version, review.analysis_run_id]);

  // Reset local state if checkpoint or novel changes completely (FE-05 isolation)
  useEffect(() => {
    setConflictMessage(null);
    setDirtyCandidateIds(new Set());
    setChoices(Object.fromEntries(reviewedDecisions.map(d => [d.candidate_id, d])));
  }, [review.analysis_run_id, novelId]);

  // Resolved decisions count
  const resolvedCandidates = candidates.filter(c => {
    const d = choices[c.candidate_id];
    return d && (d.verdict === 'entity' || d.verdict === 'not_entity');
  });

  const allCandidatesResolved =
    candidates.length > 0 &&
    candidates.every(c => {
      const d = choices[c.candidate_id];
      return d && (d.verdict === 'entity' || d.verdict === 'not_entity');
    });

  const identityVariants = new Map<string, Set<string>>();
  for (const c of resolvedCandidates) {
    const d = choices[c.candidate_id];
    if (d.verdict !== 'entity') continue;
    const identity = d.canonical_entity_id || d.provisional_identity_key;
    const variants = identityVariants.get(identity) ?? new Set<string>();
    variants.add(JSON.stringify([d.canonical_name, d.entity_type, d.initial_status]));
    identityVariants.set(identity, variants);
  }
  const inconsistentIdentity = Array.from(identityVariants.values()).some(variants => variants.size > 1);
  const clearSavedDraft = (submitted: Decision[]) => setDirtyCandidateIds(previous => new Set(
    [...previous].filter(id => !submitted.some(d => d.candidate_id === id &&
      choicesRef.current[id] && sameHumanDecision(d, choicesRef.current[id])))
  ));

  // Find candidate helper
  const getMachineDecision = (candidateId: string): Decision => {
    const found = machineDecisions.find(d => d.candidate_id === candidateId);
    if (found) return found;
    const c = candidates.find(item => item.candidate_id === candidateId);
    return {
      candidate_id: candidateId,
      verdict: 'unresolved',
      canonical_name: c?.surface ?? '',
      canonical_entity_id: '',
      provisional_identity_key: '',
      entity_type: 'PER',
      identity_quote: '',
      initial_status: 'Unknown',
      status_quote: '',
      confidence: 0,
      reason: ''
    };
  };

  // Assign decision for a single candidate (marks candidate dirty)
  const setCandidateDecision = (candidateId: string, decision: Decision) => {
    setDirtyCandidateIds(prev => new Set(prev).add(candidateId));
    setChoices(prev => ({
      ...prev,
      [candidateId]: decision
    }));
  };

  // A surface match is not identity resolution. Preserve every different explicit human identity.
  const bulkTargets = (surface: string, source: Decision) => candidates.filter(c => {
    if (c.surface.toLowerCase() !== surface.toLowerCase()) return false;
    const existing = choices[c.candidate_id];
    return !existing || existing.verdict === 'unresolved' || sameIdentity(existing, source);
  });
  const applyToMatchingSurface = (surface: string, source: Decision, template: (machine: Decision) => Decision) => {
    const targets = bulkTargets(surface, source);
    const updates = Object.fromEntries(targets.map(c => {
      // Bulk changes identity, not the source decision or another occurrence's evidence.
      if (c.candidate_id === source.candidate_id) return [c.candidate_id, source];
      const existing = choices[c.candidate_id];
      const updated = template(existing ?? getMachineDecision(c.candidate_id));
      return [c.candidate_id, existing ? {
        ...updated,
        identity_quote: existing.identity_quote,
        status_quote: existing.status_quote
      } : updated];
    }));
    setChoices(previous => ({ ...previous, ...updates }));
    setDirtyCandidateIds(previous => new Set([...previous, ...targets.map(c => c.candidate_id)]));
  };

  // Add author provisional group
  const handleAddGroup = () => {
    const trimmed = newGroupInput.trim();
    if (!trimmed) return;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
      setNewGroupError('Khóa nhóm chỉ dùng A–Z, a–z, 0–9, gạch ngang hoặc gạch dưới (1–64 ký tự); ví dụ con-van.');
      return;
    }
    setNewGroupError('');
    if (!authorGroups.includes(trimmed)) {
      setAuthorGroups(prev => [...prev, trimmed]);
    }
    setNewGroupInput('');
  };

  // Actions
  const handleSavePartial = () => {
    perform(async () => {
      setConflictMessage(null);
      try {
        const decisionsToSend = candidates
          .map(c => choices[c.candidate_id])
          .filter((d): d is Decision => Boolean(d && (d.verdict === 'entity' || d.verdict === 'not_entity')));

        await saveEntityReview(novelId, review.analysis_run_id, {
          expected_version: review.review_version,
          decisions: decisionsToSend,
          finalize: false
        });
        clearSavedDraft(decisionsToSend);
        await onContinued();
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          setConflictMessage(
            'Xung đột phiên bản (409 Conflict): Checkpoint trên máy chủ đã thay đổi. Lựa chọn của bạn vẫn được giữ lại; vui lòng kiểm tra và lưu lại.'
          );
        }
        throw err;
      }
    });
  };

  const handleRefresh = () => {
    perform(async () => {
      setConflictMessage(null);
      try {
        await refreshEntityReview(novelId, review.analysis_run_id, review.review_version);
        // Do NOT clear dirtyCandidateIds (FE-09): preserve author's uncommitted draft choices through refresh
        await onContinued();
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          setConflictMessage(
            'Phiên bản kiểm tra không khớp (409 Conflict). Dữ liệu đã được cập nhật từ máy chủ.'
          );
        }
        throw err;
      }
    });
  };

  const handleFreeze = () => {
    perform(async () => {
      setConflictMessage(null);
      try {
        const allDecisions = candidates.map(c => {
          const d = choices[c.candidate_id];
          if (!d || d.verdict === 'unresolved') {
            throw new Error(`Chưa có quyết định cho vị trí "${c.surface}" tại [${c.start}, ${c.end})`);
          }
          return d;
        });

        await saveEntityReview(novelId, review.analysis_run_id, {
          expected_version: review.review_version,
          decisions: allDecisions,
          finalize: true
        });
        clearSavedDraft(allDecisions);
        await onContinued();
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          setConflictMessage(
            'Xung đột phiên bản khi đóng băng (409 Conflict). Vui lòng làm mới để lấy phiên bản mới nhất.'
          );
        }
        throw err;
      }
    });
  };

  const handleContinue = () => {
    perform(async () => {
      setConflictMessage(null);
      await continueEntityReview(novelId, review.analysis_run_id);
      await onContinued();
    });
  };

  // Filter candidates
  const filteredCandidates = candidates.filter(c => {
    const isResolved = choices[c.candidate_id]?.verdict === 'entity' || choices[c.candidate_id]?.verdict === 'not_entity';
    if (filterMode === 'pending') return !isResolved;
    if (filterMode === 'resolved') return isResolved;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const pageCandidates = filteredCandidates.slice((activePage - 1) * pageSize, activePage * pageSize);

  return (
    <Card withBorder radius="md" p="md" data-testid={`entity-checkpoint-${review.analysis_run_id}`}>
      <Stack gap="sm">
        {/* Checkpoint Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs">
              <Text fw={600} size="sm">
                Bản phân tích {review.analysis_run_id.slice(0, 8)}...
              </Text>
              <Badge
                color={
                  review.status === 'entities_reviewed'
                    ? 'teal'
                    : review.status === 'completed'
                    ? 'blue'
                    : 'yellow'
                }
                variant="light"
              >
                {review.status === 'waiting_entity_review'
                  ? 'Chờ duyệt entity'
                  : review.status === 'entities_reviewed'
                  ? 'Đã đóng băng entity'
                  : 'Đã hoàn tất'}
              </Badge>
              <Badge variant="outline" color="gray">
                v{review.review_version}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Bản lưu: {review.revision_id?.slice(0, 8)} · Tiến độ: {resolvedCandidates.length}/
              {candidates.length} vị trí đã quyết định · Còn {candidates.length - resolvedCandidates.length} vị trí chưa quyết định
            </Text>
          </div>

          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} />}
              disabled={disabled}
              onClick={handleRefresh}
              data-testid="btn-refresh-entity-review"
            >
              Làm mới (Refresh)
            </Button>
          </Group>
        </Group>

        {conflictMessage && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            title="Xung đột phiên bản"
            withCloseButton
            onClose={() => setConflictMessage(null)}
          >
            {conflictMessage}
          </Alert>
        )}

        {review.review_error && <Alert color="red">{review.review_error}</Alert>}

        {staleGuidance && (
          <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
            Danh sách tăng cường vừa thay đổi. Hãy bấm &quot;Làm mới (Refresh)&quot; để cập nhật lại
            các gợi ý theo danh sách mới.
          </Alert>
        )}

        {/* Provisional Group Creation Bar */}
        <Paper p="xs" withBorder radius="sm" bg="var(--mantine-color-gray-0)">
          <Stack gap="xs">
            <Text size="xs" fw={600}>
              Nhóm danh tính mới (Provisional Groups) của chương này:
            </Text>
            <Group gap="xs">
              {authorGroups.length === 0 ? (
                <Text size="xs" c="dimmed">
                  Chưa có nhóm nào. Nhập tên định danh riêng (ví dụ: &quot;minh-bac-si&quot;,
                  &quot;minh-tai-xe&quot;) để phân biệt các nhân vật trùng tên.
                </Text>
              ) : (
                authorGroups.map(grp => (
                  <Badge key={grp} variant="filled" color="indigo" size="sm">
                    {grp}
                  </Badge>
                ))
              )}
            </Group>

            <Group gap="xs" align="flex-start">
              <TextInput
                size="xs"
                placeholder="Tên nhóm mới (ví dụ: minh-bac-si)"
                description="Khóa kỹ thuật ASCII, không phải tên hiển thị. Ví dụ con-van; tên hiển thị vẫn là Cồn Vân."
                value={newGroupInput}
                onChange={e => setNewGroupInput(e.currentTarget.value)}
                error={newGroupError}
                style={{ width: 240 }}
                disabled={disabled}
              />
              <Button size="xs" variant="light" onClick={handleAddGroup} disabled={disabled || !newGroupInput.trim()}>
                + Thêm nhóm
              </Button>
            </Group>
          </Stack>
        </Paper>

        {/* Filter & Batch Actions */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Button
              size="xs"
              variant={filterMode === 'all' ? 'filled' : 'subtle'}
              onClick={() => {
                setFilterMode('all');
                setActivePage(1);
              }}
            >
              Tất cả ({candidates.length})
            </Button>
            <Button
              size="xs"
              variant={filterMode === 'pending' ? 'filled' : 'subtle'}
              color="orange"
              onClick={() => {
                setFilterMode('pending');
                setActivePage(1);
              }}
            >
              Chưa duyệt ({candidates.length - resolvedCandidates.length})
            </Button>
            <Button
              size="xs"
              variant={filterMode === 'resolved' ? 'filled' : 'subtle'}
              color="teal"
              onClick={() => {
                setFilterMode('resolved');
                setActivePage(1);
              }}
            >
              Đã duyệt ({resolvedCandidates.length})
            </Button>
          </Group>

          {review.status === 'waiting_entity_review' && (
            <Button
              size="xs"
              variant="subtle"
              color="blue"
              disabled={disabled}
              onClick={() => {
                // Explicit author rejection action; preserve it as a dirty draft across refresh.
                const updates = Object.fromEntries(candidates.filter(c =>
                  !choices[c.candidate_id] && getMachineDecision(c.candidate_id).verdict === 'not_entity'
                ).map(c => [c.candidate_id, rejectOccurrence(getMachineDecision(c.candidate_id))]));
                setChoices(previous => ({ ...previous, ...updates }));
                setDirtyCandidateIds(previous => new Set([...previous, ...Object.keys(updates)]));
              }}
            >
              Tự động loại các từ AI chắc chắn không phải entity
            </Button>
          )}
        </Group>

        {/* Occurrence Cards */}
        <Stack gap="xs">
          {pageCandidates.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md">
              Không có vị trí trích xuất nào theo bộ lọc này.
            </Text>
          ) : (
            pageCandidates.map(c => {
              const machine = getMachineDecision(c.candidate_id);
              const decision = choices[c.candidate_id];
              const isPending = pendingIds.has(c.candidate_id);

              return (
                <OccurrenceCard
                  key={c.candidate_id}
                  candidate={c}
                  machine={machine}
                  decision={decision}
                  isPending={isPending}
                  knownEntities={knownEntities}
                  authorGroups={authorGroups}
                  review={review}
                  disabled={disabled || review.status !== 'waiting_entity_review'}
                  onChange={d => setCandidateDecision(c.candidate_id, d)}
                  bulkCandidates={decision ? bulkTargets(c.surface, decision) : []}
                  onApplyToAllSurface={template => decision && applyToMatchingSurface(c.surface, decision, template)}
                />
              );
            })
          )}
        </Stack>

        {totalPages > 1 && (
          <Group justify="center" mt="xs">
            <Pagination total={totalPages} value={activePage} onChange={setActivePage} size="xs" />
          </Group>
        )}

        <Divider my="xs" />

        <Paper withBorder p="xs" data-testid="entity-freeze-summary">
          <Text size="sm" fw={600}>Tóm tắt quyết định trước Freeze</Text>
          {Array.from(new Map(resolvedCandidates.filter(c => choices[c.candidate_id].verdict === 'entity').map(c => {
            const d = choices[c.candidate_id];
            const key = d.canonical_entity_id || d.provisional_identity_key || `reject:${c.candidate_id}`;
            return [JSON.stringify([key, d.canonical_name, d.entity_type, d.initial_status]), d] as const;
          })).values()).map(d => (
            <Text size="xs" key={JSON.stringify([d.canonical_entity_id || d.provisional_identity_key || d.candidate_id, d.canonical_name, d.entity_type, d.initial_status])}>
              {`${d.canonical_name} [${d.entity_type}] · ${d.canonical_entity_id || d.provisional_identity_key.split('/').at(-1)}`}
            </Text>
          ))}
          <Text size="xs">Đã loại {resolvedCandidates.filter(c => choices[c.candidate_id].verdict === 'not_entity').length} vị trí không phải thực thể.</Text>
          {inconsistentIdentity && <Alert color="orange" mt="xs">
            Cùng một UUID/nhóm đang có tên, loại hoặc trạng thái khác nhau. Kiểm tra từng vị trí hoặc áp dụng có xác nhận cho cùng danh tính trước Freeze.
          </Alert>}
          <Text size="xs" mt="xs">
            {review.status === 'entities_reviewed' ? 'Bước tiếp theo: tiếp tục trích xuất event/fact, rồi duyệt đề xuất Canon.' :
              !allCandidatesResolved ? 'Bước tiếp theo: quyết định các vị trí còn lại; có thể lưu một phần để tiếp tục sau.' :
              'Bước tiếp theo: kiểm tra tên và loại ở trên, rồi Freeze. Đề xuất Canon sẽ được duyệt ở bước riêng.'}
          </Text>
        </Paper>

        {/* Review Action Controls */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            {review.status === 'waiting_entity_review' && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  disabled={disabled || resolvedCandidates.length === 0}
                  onClick={handleSavePartial}
                >
                  Lưu quyết định một phần ({resolvedCandidates.length}/{candidates.length})
                </Button>

                <Button
                  size="sm"
                  color="indigo"
                  disabled={disabled || !allCandidatesResolved || inconsistentIdentity}
                  onClick={handleFreeze}
                >
                  Đóng băng danh sách entity (Freeze)
                </Button>
              </>
            )}

            {review.status === 'entities_reviewed' && (
              <Badge color="teal" size="lg" leftSection={<IconCheck size={14} />}>
                Đã đóng băng ({review.entities?.length ?? 0} thực thể được bảo lưu UUID)
              </Badge>
            )}
          </Group>

          <Button
            size="sm"
            color="green"
            disabled={disabled || review.status !== 'entities_reviewed'}
            onClick={handleContinue}
          >
            3. Tiếp tục trích xuất event/fact
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

// ──────────────────────────────────────────────
// Single Occurrence Card Component
// ──────────────────────────────────────────────

function OccurrenceCard({
  candidate,
  machine,
  decision,
  isPending,
  knownEntities,
  authorGroups,
  review,
  disabled,
  onChange,
  onApplyToAllSurface,
  bulkCandidates
}: {
  candidate: EntityReview['candidates'][0];
  machine: Decision;
  decision?: Decision;
  isPending: boolean;
  knownEntities: KnownEntity[];
  authorGroups: string[];
  review: EntityReview;
  disabled: boolean;
  onChange: (decision: Decision) => void;
  bulkCandidates: EntityReview['candidates'];
  onApplyToAllSurface: (template: (m: Decision) => Decision) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The checkpoint draft is the only author-edit buffer, including fields hidden by pagination.
  const canonicalName = decision?.canonical_name ?? candidate.surface;
  const entityType = decision?.entity_type ?? machine.entity_type ?? 'PER';
  const initialStatus = decision?.initial_status ?? 'Unknown';
  const identityQuote = decision?.identity_quote ?? '';
  const statusQuote = decision?.status_quote ?? '';
  const [confirmBatchOpen, setConfirmBatchOpen] = useState(false);

  // Extract selected group or entity
  const selectedKnownId = decision?.canonical_entity_id || '';
  const currentProvisionalGroup = decision?.provisional_identity_key
    ? review.provisional_identity_scope
      ? decision.provisional_identity_key.replace(`${review.provisional_identity_scope}/`, '')
      : decision.provisional_identity_key
    : '';

  // Determine current mode
  const currentMode: 'known' | 'provisional' | 'reject' | 'unresolved' =
    decision?.verdict === 'not_entity'
      ? 'reject'
      : decision?.verdict === 'entity' && decision.canonical_entity_id
      ? 'known'
      : decision?.verdict === 'entity' && decision.provisional_identity_key
      ? 'provisional'
      : 'unresolved';

  // Format known entities for Mantine Select with explicit ID disambiguation
  const knownOptions = knownEntities.map(e => ({
    value: e.entity_id,
    label: `${e.name} [${e.entity_type}] · ID: ${e.entity_id.slice(0, 8)}...`
  }));

  // Handle Known Entity Selection
  const handleSelectKnown = (entityId: string | null) => {
    if (!entityId) return;
    const target = knownEntities.find(e => e.entity_id === entityId);
    if (!target) return;
    const updated = knownIdentity(machine, target);
    onChange({
      ...updated,
      canonical_name: target.name,
      entity_type: target.entity_type,
      reason: 'Author assigned to existing canonical entity'
    });
  };

  // Handle Provisional Group Selection
  const handleSelectGroup = (groupLabel: string | null) => {
    if (!groupLabel) return;
    const updated = newIdentity(review, machine, groupLabel);
    onChange({
      ...updated,
      canonical_name: canonicalName.trim() || candidate.surface,
      entity_type: entityType,
      initial_status: initialStatus,
      identity_quote: identityQuote,
      status_quote: statusQuote,
      reason: `Author assigned to provisional identity group: ${groupLabel}`
    });
  };

  // Handle Reject
  const handleReject = () => {
    const updated = rejectOccurrence(machine);
    onChange(updated);
  };

  // Sync edits if in provisional mode
  const handleCommitEdits = (patch: Partial<Decision>) => {
    if (!currentProvisionalGroup) return;
    const updated = newIdentity(review, machine, currentProvisionalGroup);
    onChange({
      ...updated,
      canonical_name: canonicalName.trim() || candidate.surface,
      entity_type: entityType,
      initial_status: initialStatus,
      identity_quote: identityQuote,
      status_quote: statusQuote,
      ...patch,
      reason: `Author refined provisional identity: ${currentProvisionalGroup}`
    });
  };

  return (
    <Paper p="xs" withBorder radius="sm" data-testid={`entity-occurrence-${candidate.candidate_id}`}>
      <Stack gap="xs">
        {/* Header row: Surface, Offset, Decision badge */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Text fw={600} size="sm">
              &ldquo;{candidate.surface}&rdquo;
            </Text>
            <Badge size="xs" variant="outline" color="gray">
              [{candidate.start}, {candidate.end})
            </Badge>

            {/* Current Decision Pill */}
            {currentMode === 'reject' ? (
              <Badge color="red" size="xs" leftSection={<IconX size={10} />}>
                Đã loại
              </Badge>
            ) : currentMode === 'known' ? (
              <Badge color="teal" size="xs" leftSection={<IconCheck size={10} />}>
                Canon: {decision?.canonical_name} ({decision?.canonical_entity_id?.slice(0, 8)}...)
              </Badge>
            ) : currentMode === 'provisional' ? (
              <Badge color="blue" size="xs" leftSection={<IconUserCheck size={10} />}>
                Nhóm tạm: {currentProvisionalGroup} ({decision?.canonical_name}) [{decision?.entity_type}]
              </Badge>
            ) : (
              <Badge color="gray" size="xs">
                {isPending ? 'Chưa duyệt' : 'Chờ xác nhận'}
              </Badge>
            )}
          </Group>

          {/* Machine Suggestion Summary */}
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Gợi ý máy (chưa được tác giả duyệt):
            </Text>
            <Badge
              size="xs"
              variant="light"
              color={
                machine.verdict === 'entity'
                  ? 'cyan'
                  : machine.verdict === 'not_entity'
                  ? 'gray'
                  : 'yellow'
              }
            >
              {machine.verdict} {machine.entity_type ? `[${machine.entity_type}]` : ''}{' '}
              {machine.confidence ? `(${(machine.confidence * 100).toFixed(0)}%)` : ''}
            </Badge>
          </Group>
        </Group>

        {/* Source Context Snippet */}
        <Paper p="xs" bg="var(--mantine-color-gray-1)" radius="xs">
          <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
            &ldquo;{candidate.context}&rdquo;
          </Text>
        </Paper>

        {/* Human Decision Controls */}
        <Stack gap="xs">
          <Group gap="md" align="flex-end">
            {/* 1. Known Entity Selector */}
            <Select
              size="xs"
              label="Chọn thực thể Canon đã có"
              placeholder="Chọn theo tên & UUID..."
              data={knownOptions}
              value={selectedKnownId || null}
              onChange={handleSelectKnown}
              searchable
              clearable
              disabled={disabled || knownEntities.length === 0}
              style={{ flex: 1 }}
            />

            {/* 2. Provisional Group Selector */}
            <Select
              size="xs"
              label="Gán nhóm danh tính mới"
              placeholder="Chọn nhóm tạm..."
              data={authorGroups.map(g => ({ value: g, label: g }))}
              value={currentProvisionalGroup || null}
              onChange={handleSelectGroup}
              disabled={disabled || authorGroups.length === 0}
              style={{ width: 180 }}
            />

            {/* 3. Reject Button */}
            <Button
              size="xs"
              variant={currentMode === 'reject' ? 'filled' : 'light'}
              color="red"
              disabled={disabled}
              onClick={handleReject}
            >
              Loại bỏ
            </Button>

            {/* Toggle Detailed Attributes */}
            {currentMode === 'provisional' && (
              <Button size="xs" variant="subtle" onClick={() => setDetailsOpen(prev => !prev)}>
                {detailsOpen ? 'Ẩn chi tiết' : 'Sửa thuộc tính'}
              </Button>
            )}
          </Group>

          {/* Collapsible Attributes for Provisional Identity */}
          <Collapse in={detailsOpen && currentMode === 'provisional'}>
            <Paper p="xs" withBorder radius="sm" mt="xs">
              <Stack gap="xs">
                <Text size="xs" fw={600}>
                  Thuộc tính định danh tạm thời:
                </Text>
                <Group grow>
                  <TextInput
                    size="xs"
                    label="Tên chuẩn (phải có bằng chứng trong chương)"
                    value={canonicalName}
                    onChange={e => handleCommitEdits({ canonical_name: e.currentTarget.value })}
                    disabled={disabled}
                  />
                  <Select
                    size="xs"
                    label="Loại thực thể"
                    description="PER: nhân vật · LOC: địa danh · ORG: tổ chức · ITEM: vật phẩm · SKILL: kỹ năng"
                    data={ENTITY_TYPES}
                    value={entityType}
                    onChange={v => { if (v) handleCommitEdits({ entity_type: v as EntityType }); }}
                    disabled={disabled}
                  />
                  <Select
                    size="xs"
                    label="Trạng thái ban đầu"
                    data={STATUS_OPTIONS}
                    value={initialStatus}
                    onChange={v => { if (v) handleCommitEdits({ initial_status: v as 'Alive' | 'Dead' | 'Unknown' }); }}
                    disabled={disabled}
                  />
                </Group>
                <Group grow>
                  <TextInput
                    size="xs"
                    label="Bằng chứng alias / tên khác"
                    placeholder="Đoạn văn chứng minh..."
                    value={identityQuote}
                    onChange={e => handleCommitEdits({ identity_quote: e.currentTarget.value })}
                    disabled={disabled}
                  />
                  <TextInput
                    size="xs"
                    label="Bằng chứng trạng thái"
                    placeholder="Đoạn văn chứng minh trạng thái..."
                    value={statusQuote}
                    onChange={e => handleCommitEdits({ status_quote: e.currentTarget.value })}
                    disabled={disabled}
                  />
                </Group>
                <Text size="xs" c="dimmed">
                  Thuộc tính đang ở bản nháp của checkpoint. Chọn Lưu quyết định một phần hoặc Freeze để lưu lên máy chủ.
                </Text>
              </Stack>
            </Paper>
          </Collapse>

          {/* Batch Helper Link with Explicit Confirmation (FE-02) */}
          {decision && currentMode !== 'unresolved' && (
            <Stack gap="xs" align="flex-end">
              {!confirmBatchOpen ? (
                <Button
                  variant="transparent"
                  size="compact-xs"
                  color="dimmed"
                  disabled={disabled}
                  onClick={() => setConfirmBatchOpen(true)}
                >
                  Áp dụng quyết định này cho các vị trí phù hợp &ldquo;{candidate.surface}&rdquo;
                </Button>
              ) : (
                <Paper p="xs" withBorder radius="xs" bg="var(--mantine-color-orange-0)">
                  <Stack gap="xs">
                    <Text size="xs" fw={500} c="orange.9">
                      Xác nhận áp dụng cho {bulkCandidates.length} vị trí:
                    </Text>
                    <Text size="xs">
                      Hai nhân vật khác nhau có thể trùng tên mặt chữ &ldquo;{candidate.surface}&rdquo;.
                      Chỉ áp dụng cho vị trí chưa quyết định hoặc đã chọn cùng danh tính. Quyết định khác UUID/nhóm hoặc đã loại được giữ nguyên. Các vị trí: {bulkCandidates.map(c => `[${c.start}, ${c.end})`).join(', ')}.
                    </Text>
                    <Group justify="flex-end" gap="xs">
                      <Button size="compact-xs" variant="default" onClick={() => setConfirmBatchOpen(false)}>
                        Hủy
                      </Button>
                      <Button
                        size="compact-xs"
                        color="orange"
                        disabled={disabled || bulkCandidates.length === 0}
                        onClick={() => {
                          setConfirmBatchOpen(false);
                          if (currentMode === 'reject') {
                            onApplyToAllSurface(m => rejectOccurrence(m));
                          } else if (currentMode === 'known') {
                            const target = knownEntities.find(e => e.entity_id === selectedKnownId);
                            if (target) {
                              onApplyToAllSurface(m => knownIdentity(m, target));
                            }
                          } else if (currentMode === 'provisional' && currentProvisionalGroup) {
                            onApplyToAllSurface(m => ({
                              ...newIdentity(review, m, currentProvisionalGroup),
                              canonical_name: canonicalName.trim() || candidate.surface,
                              entity_type: entityType,
                              initial_status: initialStatus
                            }));
                          }
                        }}
                      >
                        Xác nhận gán toàn bộ
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              )}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
