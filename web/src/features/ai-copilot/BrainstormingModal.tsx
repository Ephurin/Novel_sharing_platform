import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import {
  requestBrainstorm,
  type BrainstormTarget,
  type BrainstormParticipant,
  type ProposedWorldRule,
  type ProposedCharacter,
  type ProposedFutureEvent,
  type BrainstormProvenance,
  type BrainstormRequest,
} from './brainstorm-api';

export type BrainstormModalProps = {
  opened: boolean;
  onClose: () => void;
  novelId: string;
  defaultTarget?: BrainstormTarget;
  currentChapter?: number;
  targetChapter?: number;
  /** Highest chapter that already exists; future events must target a later chapter (#134). */
  lastWrittenChapter?: number;
  expectedBrainVersion?: number;
  expectedPlanVersion?: number;
  /** Called after a CAS conflict (409); the host re-reads its authoritative state and resolves true only if that read succeeded. */
  onReloadRequested?: () => boolean | Promise<boolean>;
  // Adopt handlers return null on success or a user-facing reason why nothing was adopted.
  // A scope without a handler is not offered and its cards have no adopt button.
  onAdoptWorldRule?: (rule: AdoptedWorldRule) => AdoptResult;
  onAdoptCharacter?: (char: AdoptedCharacter) => AdoptResult;
  onAdoptFutureEvent?: (ev: AdoptedFutureEvent) => AdoptResult;
};

export type AdoptResult = string | null | void;
export type AdoptedWorldRule = { text: string; fact_key?: string };
export type AdoptedCharacter = {
  display_name: string;
  entity_type: 'character';
  role: ProposedCharacter['role'];
  description: string;
  archetype: string;
  aliases: string[];
};
export type AdoptedFutureEvent = {
  target_chapter: number;
  text: string;
  title: string;
  participants: BrainstormParticipant[];
};

const RETRYABLE_STATUSES = new Set([0, 429, 502, 503, 504]);
// brainstorm-v1 409s that mean "the same keyed request is still owned by a worker": retrying with the
// SAME key returns that request's result; a new key would start a second provider generation.
const SAME_KEY_RETRY_CODES = new Set(['IDEMPOTENCY_IN_FLIGHT_CONFLICT', 'IDEMPOTENCY_LEASE_EXPIRED']);

/** retryable = resend the identical keyed request; conflict = re-read server state first; other = new request. */
export function classifyBrainstormError(status: number, code: string): 'retryable' | 'conflict' | 'other' {
  if (status === 409) {
    if (SAME_KEY_RETRY_CODES.has(code)) return 'retryable';
    if (code === 'IDEMPOTENCY_CONFLICT') return 'other';
    return 'conflict';
  }
  return RETRYABLE_STATUSES.has(status) ? 'retryable' : 'other';
}
const TARGET_LABELS: Record<BrainstormTarget, string> = {
  all: 'Tất cả (Quy tắc, Nhân vật, Sự kiện)',
  world_rules: 'Quy tắc thế giới (World Rules)',
  characters: 'Nhân vật & Hạt giống danh tính',
  future_events: 'Sự kiện tương lai (Future Events)',
};

/** Merge title and summary so neither is silently dropped when a plan event only stores text. */
export function futureEventText(ev: { title?: string; text?: string; description?: string }) {
  const title = ev.title?.trim() ?? '';
  const body = (ev.text || ev.description || '').trim();
  if (!title) return body;
  if (!body || body === title || body.startsWith(title)) return body || title;
  return `${title}: ${body}`;
}

export function BrainstormingModal({
  opened,
  onClose,
  novelId,
  defaultTarget = 'all',
  currentChapter,
  targetChapter = 1,
  lastWrittenChapter = 0,
  expectedBrainVersion,
  expectedPlanVersion,
  onReloadRequested,
  onAdoptWorldRule,
  onAdoptCharacter,
  onAdoptFutureEvent,
}: BrainstormModalProps) {
  const allowedTargets: BrainstormTarget[] = [
    ...(onAdoptWorldRule && onAdoptCharacter && onAdoptFutureEvent ? ['all' as const] : []),
    ...(onAdoptWorldRule ? ['world_rules' as const] : []),
    ...(onAdoptCharacter ? ['characters' as const] : []),
    ...(onAdoptFutureEvent ? ['future_events' as const] : []),
  ];
  const pickTarget = (t: BrainstormTarget) => (allowedTargets.includes(t) ? t : allowedTargets[0] ?? t);
  const [target, setTarget] = useState<BrainstormTarget>(() => pickTarget(defaultTarget));
  const [instruction, setInstruction] = useState('');
  const [targetChap, setTargetChap] = useState<number | ''>(targetChapter || 1);
  const [currentChap, setCurrentChap] = useState<number | ''>(currentChapter ?? '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'retryable' | 'conflict' | 'other' | null>(null);
  const [adoptError, setAdoptError] = useState('');
  const [reloading, setReloading] = useState(false);

  // Suggestions state
  const [rules, setRules] = useState<ProposedWorldRule[]>([]);
  const [characters, setCharacters] = useState<ProposedCharacter[]>([]);
  const [events, setEvents] = useState<ProposedFutureEvent[]>([]);
  const [provenance, setProvenance] = useState<BrainstormProvenance | null>(null);

  // Tracking adopted items by ID
  const [adoptedIds, setAdoptedIds] = useState<Set<string>>(new Set());

  // Idempotency tracking
  const activeIdempotencyKeyRef = useRef<string>('');
  const lastRequestRef = useRef<BrainstormRequest | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const openContextRef = useRef<string | null>(null);

  // Sync default target and chapters on opened
  useEffect(() => {
    if (opened) {
      // An error or retry snapshot from an earlier opening is never shown as if it were current.
      setError('');
      setErrorCode(null);
      setErrorKind(null);
      setAdoptError('');
      lastRequestRef.current = null;
      activeIdempotencyKeyRef.current = '';
      // Suggestions are kept only when reopened for the same scope and chapter.
      const context = JSON.stringify([defaultTarget, targetChapter]);
      if (openContextRef.current !== context) {
        setRules([]);
        setCharacters([]);
        setEvents([]);
        setProvenance(null);
        setAdoptedIds(new Set());
      }
      openContextRef.current = context;
      setTarget(pickTarget(defaultTarget));
      if (targetChapter) setTargetChap(targetChapter);
      if (currentChapter !== undefined) setCurrentChap(currentChapter);
    } else {
      // Abort in-flight requests on close
      abortControllerRef.current?.abort();
      setLoading(false);
    }
  }, [opened, defaultTarget, targetChapter, currentChapter]);

  const generateIdempotencyKey = () => `idem-bs-${crypto.randomUUID()}`;

  async function executeBrainstorm(req: BrainstormRequest, idemKey: string) {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError('');
    setErrorCode(null);
    setErrorKind(null);
    setAdoptError('');

    try {
      const response = await requestBrainstorm(novelId, { ...req, idempotency_key: idemKey }, controller.signal);
      if (controller.signal.aborted) return;

      setRules(response.world_rules || []);
      setCharacters(response.characters || response.character_seeds || []);
      setEvents(response.future_events || response.events || []);
      setProvenance(response.provenance);
      // Reset adopted tracker for new batch
      setAdoptedIds(new Set());
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiClientError) {
        setErrorCode(err.code);
        const kind = classifyBrainstormError(err.status, err.code);
        setErrorKind(kind);
        if (kind === 'retryable' && err.status === 409) {
          setError(`Yêu cầu này vẫn đang được máy chủ xử lý (${err.code}). Nhấn "Thử lại an toàn" để nhận kết quả của chính yêu cầu đó; không tạo yêu cầu mới.`);
        } else if (err.code === 'IDEMPOTENCY_CONFLICT') {
          setError(`Khóa yêu cầu đã dùng cho nội dung khác (${err.code}). Nhấn "Tạo gợi ý AI" để gửi yêu cầu mới.`);
        } else if (err.status === 409) {
          setError(`Xung đột phiên bản (${err.code}). Trạng thái Story Brain hoặc Dàn ý đã thay đổi trên máy chủ. Đọc lại trạng thái máy chủ rồi tạo yêu cầu mới; không thử lại yêu cầu cũ.`);
        } else if (err.status === 429) {
          setError(`Đã chạm giới hạn yêu cầu AI (${err.code}). Nhấn "Thử lại an toàn" sau ít phút.`);
        } else if (err.status === 502) {
          setError(`Lỗi từ nhà cung cấp mô hình AI (${err.code}). Bạn có thể thử lại an toàn.`);
        } else if (err.status === 503) {
          setError(`Dịch vụ tạm thời không khả dụng (${err.code}). Bạn có thể thử lại an toàn.`);
        } else {
          setError(getApiErrorMessage(err));
        }
      } else {
        setErrorKind('other');
        setError(getApiErrorMessage(err));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  /** The exact request the current form and host versions would send (without idempotency key). */
  function buildPayload(): BrainstormRequest {
    const payload: BrainstormRequest = {
      contract_version: 'brainstorm-v1',
      target,
      instruction: instruction.trim(),
    };
    if (expectedBrainVersion !== undefined) payload.expected_brain_version = expectedBrainVersion;
    if (expectedPlanVersion !== undefined) payload.expected_plan_version = expectedPlanVersion;
    if (target === 'future_events' || target === 'all') {
      if (typeof targetChap === 'number' && targetChap >= 1) payload.target_chapter = targetChap;
      if (typeof currentChap === 'number' && currentChap >= 1) payload.current_chapter = currentChap;
    }
    return payload;
  }

  function handleStartBrainstorm() {
    const idemKey = generateIdempotencyKey();
    activeIdempotencyKeyRef.current = idemKey;
    const payload = buildPayload();
    lastRequestRef.current = payload;
    void executeBrainstorm(payload, idemKey);
  }

  // A retry may reuse the idempotency key only for the byte-identical request.
  const retrySnapshot = lastRequestRef.current;
  const retryMatchesForm = !!retrySnapshot && JSON.stringify(retrySnapshot) === JSON.stringify(buildPayload());

  function handleSafeRetry() {
    if (errorKind !== 'retryable' || !lastRequestRef.current || !activeIdempotencyKeyRef.current) return;
    if (JSON.stringify(lastRequestRef.current) !== JSON.stringify(buildPayload())) return;
    void executeBrainstorm(lastRequestRef.current, activeIdempotencyKeyRef.current);
  }

  async function handleReload() {
    if (!onReloadRequested) return;
    setReloading(true);
    try {
      // Hosts report whether the authoritative re-read actually succeeded; only then is the conflict cleared.
      const ok = await onReloadRequested();
      if (!ok) {
        setError('Không đọc lại được trạng thái máy chủ. Kiểm tra kết nối rồi nhấn "Đọc lại trạng thái máy chủ" lần nữa; yêu cầu cũ chưa được gửi lại.');
        return;
      }
      setError('');
      setErrorCode(null);
      setErrorKind(null);
      lastRequestRef.current = null;
      activeIdempotencyKeyRef.current = '';
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setReloading(false);
    }
  }

  // Adopt Actions: mark as adopted only when the host confirms the draft changed.
  function adopt(id: string, run: () => AdoptResult) {
    const reason = run();
    if (reason) {
      setAdoptError(reason);
      return;
    }
    setAdoptError('');
    setAdoptedIds(prev => new Set([...prev, id]));
  }

  function handleAdoptRule(rule: ProposedWorldRule) {
    if (!onAdoptWorldRule) return;
    adopt(rule.rule_id, () => onAdoptWorldRule({ text: rule.text, fact_key: rule.fact_key }));
  }

  function handleAdoptCharacter(char: ProposedCharacter) {
    if (!onAdoptCharacter) return;
    adopt(char.character_id, () =>
      onAdoptCharacter({
        display_name: char.name || char.canonical_name,
        entity_type: 'character',
        role: char.role,
        description: char.description ?? '',
        archetype: char.archetype ?? '',
        aliases: char.aliases ?? [],
      })
    );
  }

  function handleAdoptEvent(ev: ProposedFutureEvent) {
    if (!onAdoptFutureEvent) return;
    adopt(ev.event_id, () =>
      onAdoptFutureEvent({
        target_chapter: ev.target_chapter,
        title: ev.title,
        text: futureEventText(ev),
        participants: ev.participants || [],
      })
    );
  }

  // Dismiss Actions
  function handleDismissRule(id: string) {
    setRules(prev => prev.filter(r => r.rule_id !== id));
  }

  function handleDismissCharacter(id: string) {
    setCharacters(prev => prev.filter(c => c.character_id !== id));
  }

  function handleDismissEvent(id: string) {
    setEvents(prev => prev.filter(e => e.event_id !== id));
  }

  function handleDismissAll() {
    setRules([]);
    setCharacters([]);
    setEvents([]);
    setProvenance(null);
  }

  const hasSuggestions = rules.length > 0 || characters.length > 0 || events.length > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={700} size="lg">Trợ lý AI Động não (AI Brainstorming)</Text>}
      size="xl"
      aria-label="AI Brainstorming Modal"
    >
      <Stack gap="md">
        <Alert color="blue" title="Chỉ tạo gợi ý bản nháp (Draft-Only)">
          Gợi ý từ AI mang trạng thái <Badge size="xs" color="violet">model_proposed</Badge> và chỉ được đưa vào bản nháp của bạn khi bạn chọn dùng. <strong>Không tự ghi Canon, không tạo lịch sử, và không kích hoạt M0.</strong> Ghi chú riêng tư của bạn không bao giờ được gửi tới mô hình AI.
        </Alert>

        <Group grow align="flex-start">
          <Select
            label="Phạm vi gợi ý"
            value={target}
            allowDeselect={false}
            data={allowedTargets.map(value => ({ value, label: TARGET_LABELS[value] }))}
            onChange={v => setTarget(pickTarget((v as BrainstormTarget) || target))}
            disabled={loading}
            aria-label="Phạm vi gợi ý"
          />

          {(target === 'future_events' || target === 'all') && (
            <>
              <NumberInput
                label="Chương mục tiêu"
                min={1}
                allowDecimal={false}
                value={targetChap}
                onChange={v => setTargetChap(typeof v === 'number' ? v : '')}
                disabled={loading}
                aria-label="Chương mục tiêu gợi ý"
              />
              <NumberInput
                label="Chương hiện tại (tùy chọn)"
                min={1}
                allowDecimal={false}
                value={currentChap}
                onChange={v => setCurrentChap(typeof v === 'number' ? v : '')}
                disabled={loading}
                aria-label="Chương hiện tại"
              />
            </>
          )}
        </Group>

        {(target === 'future_events' || target === 'all') &&
          typeof targetChap === 'number' &&
          lastWrittenChapter > 0 &&
          targetChap <= lastWrittenChapter && (
            <Alert color="yellow" data-testid="brainstorm-target-written-warning">
              Chương {targetChap} đã được viết — đó là lịch sử, không phải tương lai. Gợi ý cho chương này sẽ không thể
              thêm vào dàn ý. Hãy chọn chương từ {lastWrittenChapter + 1} trở đi.
            </Alert>
          )}

        <Textarea
          label="Định hướng yêu cầu cho AI (Tùy chọn)"
          placeholder="Ví dụ: Đề xuất các môn phái đối đầu nhau ở Nam Vực, hoặc một biến cố dị tượng trước thềm đại hội..."
          value={instruction}
          onChange={e => setInstruction(e.currentTarget.value)}
          minRows={3}
          maxLength={10000}
          disabled={loading}
          description="Chỉ gửi ý tưởng định hướng. Ghi chú cá nhân riêng tư của bạn được bảo vệ an toàn."
          aria-label="Yêu cầu định hướng cho AI"
        />

        {error && (
          <Alert color="red" title="Không thể tạo gợi ý" role="alert" data-testid="brainstorm-error-alert">
            <Stack gap="xs">
              <Text size="sm">{error}</Text>
              {errorCode && <Text size="xs" c="dimmed">Mã lỗi: {errorCode}</Text>}
              {errorKind === 'retryable' && (
                <>
                  {!retryMatchesForm && (
                    <Text size="sm" c="orange" data-testid="brainstorm-retry-stale-warning">
                      Yêu cầu đã thay đổi so với lần bị lỗi. "Thử lại an toàn" chỉ gửi lại đúng yêu cầu cũ; nhấn "Tạo gợi ý AI" để gửi yêu cầu mới.
                    </Text>
                  )}
                  <Group>
                    <Button
                      size="xs"
                      variant="outline"
                      color="red"
                      onClick={handleSafeRetry}
                      disabled={loading || !retryMatchesForm}
                      data-testid="brainstorm-safe-retry-btn"
                    >
                      Thử lại an toàn (Safe Retry)
                    </Button>
                  </Group>
                </>
              )}
              {errorKind === 'conflict' && onReloadRequested && (
                <Group>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => void handleReload()}
                    loading={reloading}
                    disabled={loading}
                    data-testid="brainstorm-reload-btn"
                  >
                    Đọc lại trạng thái máy chủ
                  </Button>
                </Group>
              )}
            </Stack>
          </Alert>
        )}

        {adoptError && (
          <Alert color="orange" title="Chưa đưa gợi ý vào bản nháp" data-testid="brainstorm-adopt-error">
            {adoptError}
          </Alert>
        )}

        <Group justify="space-between">
          <Button
            onClick={handleStartBrainstorm}
            loading={loading}
            data-testid="brainstorm-submit-btn"
          >
            Tạo gợi ý AI
          </Button>
          {hasSuggestions && (
            <Button
              variant="subtle"
              color="gray"
              onClick={handleDismissAll}
              disabled={loading}
              data-testid="brainstorm-dismiss-all-btn"
            >
              Bỏ tất cả gợi ý
            </Button>
          )}
        </Group>

        {/* Suggestion Results */}
        {hasSuggestions && (
          <Stack gap="md" mt="sm" data-testid="brainstorm-results-container">
            <Divider label="Danh sách thẻ gợi ý (Chỉnh sửa trước khi chọn dùng)" labelPosition="center" />

            {/* World Rules */}
            {rules.length > 0 && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600} size="sm">Quy tắc thế giới ({rules.length})</Text>
                  <Badge color="blue" size="xs">World Rules</Badge>
                </Group>
                {rules.map((rule, idx) => {
                  const isAdopted = adoptedIds.has(rule.rule_id);
                  return (
                    <Card withBorder key={rule.rule_id} data-testid={`brainstorm-rule-card-${idx}`}>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Group gap="xs">
                            <Badge color="violet" size="sm">AI đề xuất (model_proposed)</Badge>
                            <Badge color="gray" variant="outline" size="sm">Chưa vào Canon</Badge>
                            {rule.category && <Badge color="cyan" size="xs">{rule.category}</Badge>}
                          </Group>
                          <Button
                            variant="subtle"
                            color="gray"
                            size="xs"
                            onClick={() => handleDismissRule(rule.rule_id)}
                            data-testid={`dismiss-rule-btn-${idx}`}
                          >
                            Bỏ qua
                          </Button>
                        </Group>

                        <Textarea
                          label={`Nội dung quy tắc ${idx + 1}`}
                          value={rule.text}
                          onChange={e => {
                            const val = e.currentTarget.value;
                            setRules(prev => prev.map(r => r.rule_id === rule.rule_id ? { ...r, text: val } : r));
                          }}
                          minRows={2}
                          data-testid={`rule-text-input-${idx}`}
                        />

                        <Group justify="flex-end">
                          {isAdopted ? (
                            <Badge color="green" size="md" data-testid={`rule-adopted-badge-${idx}`}>
                              Đã thêm vào bản nháp
                            </Badge>
                          ) : onAdoptWorldRule ? (
                            <Button
                              size="xs"
                              variant="filled"
                              color="blue"
                              onClick={() => handleAdoptRule(rule)}
                              disabled={!rule.text.trim()}
                              data-testid={`adopt-rule-btn-${idx}`}
                            >
                              Chọn dùng vào bản nháp
                            </Button>
                          ) : null}
                        </Group>
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            )}

            {/* Characters */}
            {characters.length > 0 && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600} size="sm">Nhân vật & Hạt giống danh tính ({characters.length})</Text>
                  <Badge color="teal" size="xs">Characters</Badge>
                </Group>
                {characters.map((char, idx) => {
                  const isAdopted = adoptedIds.has(char.character_id);
                  return (
                    <Card withBorder key={char.character_id} data-testid={`brainstorm-character-card-${idx}`}>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Group gap="xs">
                            <Badge color="violet" size="sm">AI đề xuất (model_proposed)</Badge>
                            <Badge color="gray" variant="outline" size="sm">Chưa vào Canon</Badge>
                            {char.role && <Badge color="teal" size="xs">{char.role}</Badge>}
                          </Group>
                          <Button
                            variant="subtle"
                            color="gray"
                            size="xs"
                            onClick={() => handleDismissCharacter(char.character_id)}
                            data-testid={`dismiss-character-btn-${idx}`}
                          >
                            Bỏ qua
                          </Button>
                        </Group>

                        <TextInput
                          label="Tên nhân vật"
                          value={char.name}
                          onChange={e => {
                            const val = e.currentTarget.value;
                            setCharacters(prev => prev.map(c => c.character_id === char.character_id ? { ...c, name: val, canonical_name: val } : c));
                          }}
                          data-testid={`character-name-input-${idx}`}
                        />

                        <Textarea
                          label="Mô tả / Tính cách / Vai trò"
                          value={char.description}
                          onChange={e => {
                            const val = e.currentTarget.value;
                            setCharacters(prev => prev.map(c => c.character_id === char.character_id ? { ...c, description: val } : c));
                          }}
                          minRows={2}
                          data-testid={`character-desc-input-${idx}`}
                        />

                        <Group justify="flex-end">
                          {isAdopted ? (
                            <Badge color="green" size="md" data-testid={`character-adopted-badge-${idx}`}>
                              Đã thêm vào bản nháp
                            </Badge>
                          ) : onAdoptCharacter ? (
                            <Button
                              size="xs"
                              variant="filled"
                              color="teal"
                              onClick={() => handleAdoptCharacter(char)}
                              disabled={!char.name.trim()}
                              data-testid={`adopt-character-btn-${idx}`}
                            >
                              Chọn dùng vào bản nháp
                            </Button>
                          ) : null}
                        </Group>
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            )}

            {/* Future Events */}
            {events.length > 0 && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600} size="sm">Sự kiện tương lai ({events.length})</Text>
                  <Badge color="indigo" size="xs">Future Events</Badge>
                </Group>
                {events.map((ev, idx) => {
                  const isAdopted = adoptedIds.has(ev.event_id);
                  return (
                    <Card withBorder key={ev.event_id} data-testid={`brainstorm-event-card-${idx}`}>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Group gap="xs">
                            <Badge color="violet" size="sm">AI đề xuất (model_proposed)</Badge>
                            <Badge color="gray" variant="outline" size="sm">Dự kiến Chương {ev.target_chapter}</Badge>
                            <Badge color="gray" variant="outline" size="sm">Chưa vào Canon</Badge>
                          </Group>
                          <Button
                            variant="subtle"
                            color="gray"
                            size="xs"
                            onClick={() => handleDismissEvent(ev.event_id)}
                            data-testid={`dismiss-event-btn-${idx}`}
                          >
                            Bỏ qua
                          </Button>
                        </Group>

                        <Group grow>
                          <TextInput
                            label="Tiêu đề sự kiện"
                            value={ev.title}
                            onChange={e => {
                              const val = e.currentTarget.value;
                              setEvents(prev => prev.map(x => x.event_id === ev.event_id ? { ...x, title: val } : x));
                            }}
                            data-testid={`event-title-input-${idx}`}
                          />
                          <NumberInput
                            label="Chương dự kiến"
                            min={1}
                            allowDecimal={false}
                            value={ev.target_chapter}
                            onChange={v => {
                              const num = typeof v === 'number' && v >= 1 ? v : 1;
                              setEvents(prev => prev.map(x => x.event_id === ev.event_id ? { ...x, target_chapter: num } : x));
                            }}
                            data-testid={`event-chapter-input-${idx}`}
                          />
                        </Group>

                        <Textarea
                          label="Nội dung tóm tắt sự kiện"
                          value={ev.text || ev.description || ''}
                          onChange={e => {
                            const val = e.currentTarget.value;
                            setEvents(prev => prev.map(x => x.event_id === ev.event_id ? { ...x, text: val, description: val } : x));
                          }}
                          minRows={2}
                          data-testid={`event-text-input-${idx}`}
                        />

                        {ev.participants && ev.participants.length > 0 && (
                          <Text size="xs" c="dimmed">
                            Người tham gia: {ev.participants.map(p => p.name_hint || p.entity_id || 'Chưa xác định').join(', ')}
                          </Text>
                        )}

                        <Group justify="flex-end">
                          {isAdopted ? (
                            <Badge color="green" size="md" data-testid={`event-adopted-badge-${idx}`}>
                              Đã thêm vào bản nháp
                            </Badge>
                          ) : onAdoptFutureEvent ? (
                            <Button
                              size="xs"
                              variant="filled"
                              color="indigo"
                              onClick={() => handleAdoptEvent(ev)}
                              disabled={!(ev.title.trim() || (ev.text && ev.text.trim()))}
                              data-testid={`adopt-event-btn-${idx}`}
                            >
                              Chọn dùng vào bản nháp
                            </Button>
                          ) : null}
                        </Group>
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            )}

            {provenance && (
              <Card withBorder bg="var(--mantine-color-gray-0)" p="xs">
                <Text size="xs" c="dimmed">
                  Nguồn gốc gợi ý: Nhà cung cấp <strong>{provenance.provider}</strong> · Mô hình <strong>{provenance.model}</strong> · Tham chiếu: {provenance.grounding_rules_count} quy tắc, {provenance.grounding_entities_count} nhân vật đã duyệt · Thời gian: {new Date(provenance.timestamp).toLocaleString('vi-VN')}
                </Text>
                {(provenance.duplicates_removed ?? 0) > 0 && (
                  <Text size="xs" c="dimmed" data-testid="brainstorm-duplicates-removed">
                    Đã ẩn {provenance.duplicates_removed} gợi ý trùng với quy tắc hoặc nhân vật đã duyệt.
                  </Text>
                )}
              </Card>
            )}
          </Stack>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} data-testid="brainstorm-close-btn">
            Đóng
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

