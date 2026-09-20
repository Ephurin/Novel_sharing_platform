import { useState, useEffect, useRef } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Textarea,
  Button,
  Badge,
  Alert,
  Modal,
  Progress,
  Divider,
  SegmentedControl,
  ScrollArea,
  Box,
  Code
} from '@mantine/core';
import {
  IconBrain,
  IconCheck,
  IconAlertTriangle,
  IconEye,
  IconCamera,
  IconSparkles,
  IconHistory,
  IconX
} from '@tabler/icons-react';
import {
  fetchContextPreview,
  startWritingGeneration,
  getJobStatus,
  acceptDraftRevision,
  createChapterSnapshot,
  listChapterRevisions,
  utf16OffsetToCodePoint,
  type ContextPreviewData,
  type WritingGenerationJob,
  type ChapterRevision
} from './ai-copilot-api';

type WritingOperation = 'continue' | 'rewrite' | 'describe' | 'dialogue';

interface WritingAssistantPanelProps {
  novelId: string;
  chapterId: string;
  editorContent: string;
  onApplyContent: (newContent: string) => void;
  getTextSelection?: () => { start: number; end: number; selectedText: string };
}

export function WritingAssistantPanel({
  novelId,
  chapterId,
  editorContent,
  onApplyContent,
  getTextSelection
}: WritingAssistantPanelProps) {
  const [operation, setOperation] = useState<WritingOperation>('continue');
  const [instruction, setInstruction] = useState('Tiếp tục mạch truyện với giọng văn tự nhiên và nhất quán.');
  
  // Context Preview state
  const [previewModalOpened, setPreviewModalOpened] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ContextPreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Generation Job state
  const [job, setJob] = useState<WritingGenerationJob | null>(null);
  const [generating, setGenerating] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Revisions & Snapshot state
  const [revisions, setRevisions] = useState<ChapterRevision[]>([]);
  const [revisionsModalOpened, setRevisionsModalOpened] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Polling ref
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  // Fetch revisions when chapter changes and cancel any ongoing polling
  useEffect(() => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setGenerating(false);
    setJob(null);
    setJobError(null);

    if (chapterId) {
      loadRevisions();
    } else {
      setRevisions([]);
    }
  }, [chapterId]);

  const loadRevisions = async () => {
    if (!chapterId) return;
    try {
      setRevisionsLoading(true);
      const data = await listChapterRevisions(chapterId);
      setRevisions(data);
    } catch {
      // Revisions might be empty for newly created chapters
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
    }
  };

  const handleOpenContextPreview = async () => {
    if (!novelId) return;
    setPreviewModalOpened(true);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await fetchContextPreview(novelId, { chapterId });
      setPreviewData(data);
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : 'Không thể tải ngữ cảnh cốt truyện');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!chapterId) return;
    setSnapshotLoading(true);
    try {
      await createChapterSnapshot(chapterId, editorContent);
      await loadRevisions();
    } catch (err: unknown) {
      alert(`Lỗi tạo bản chụp: ${err instanceof Error ? err.message : 'Không rõ nguyên nhân'}`);
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleStartGeneration = async () => {
    if (!novelId || !chapterId) return;

    setGenerating(true);
    setJobError(null);
    setJob(null);

    try {
      // Ensure we have a base revision and verify editor dirty state
      let baseRevision = revisions[0];
      if (!baseRevision) {
        // Create initial snapshot first
        baseRevision = await createChapterSnapshot(chapterId, editorContent);
        await loadRevisions();
      } else if (baseRevision.content !== editorContent) {
        // Dirty editor guard: Prompt to snapshot modified text to avoid stale offset application
        const autoSnap = window.confirm(
          'Nội dung soạn thảo có thay đổi chưa lưu vào bản chụp. Bạn có muốn tự động tạo bản chụp mới để đảm bảo vị trí con trỏ chính xác không?'
        );
        if (autoSnap) {
          baseRevision = await createChapterSnapshot(chapterId, editorContent);
          await loadRevisions();
        } else {
          setGenerating(false);
          setJobError('Vui lòng tạo bản chụp hoặc lưu bản nháp trước khi sinh bản thảo.');
          return;
        }
      }

      // Retrieve actual brain version from preview data if available
      let brainVer = previewData?.brain_version;
      if (!brainVer && novelId) {
        try {
          const preview = await fetchContextPreview(novelId, { chapterId });
          setPreviewData(preview);
          brainVer = preview.brain_version;
        } catch {
          brainVer = 1;
        }
      }

      // Calculate selection offsets in Unicode code points
      const selection = getTextSelection ? getTextSelection() : { start: 0, end: 0, selectedText: '' };
      const codePointStart = utf16OffsetToCodePoint(editorContent, selection.start);
      const codePointEnd = utf16OffsetToCodePoint(editorContent, selection.end);

      const initiatedJob = await startWritingGeneration({
        novelId,
        chapterId,
        revisionId: baseRevision.revisionId,
        contentHash: baseRevision.contentHash,
        operation,
        selection: {
          start: codePointStart,
          end: codePointEnd,
          cursor: codePointEnd
        },
        instruction,
        expectedBrainVersion: brainVer ?? 1
      });

      setJob(initiatedJob);

      // Start polling
      pollJob(initiatedJob.job_id);
    } catch (err: unknown) {
      setGenerating(false);
      setJobError(err instanceof Error ? err.message : 'Không thể bắt đầu tác vụ sinh bản thảo');
    }
  };

  const pollJob = async (jobId: string) => {
    try {
      const updated = await getJobStatus(jobId);
      setJob(updated);

      const status = updated.status?.toLowerCase();
      if (status === 'completed') {
        setGenerating(false);
      } else if (status === 'failed') {
        setGenerating(false);
        setJobError(updated.error?.message || 'Tác vụ sinh văn bản thất bại');
      } else {
        pollTimerRef.current = window.setTimeout(() => {
          void pollJob(jobId);
        }, 1000);
      }
    } catch (err: unknown) {
      setGenerating(false);
      setJobError(err instanceof Error ? err.message : 'Lỗi khi kiểm tra tiến trình tác vụ');
    }
  };


  const handleAcceptDraft = async () => {
    if (!chapterId || !job) return;
    setAccepting(true);
    try {
      const result = await acceptDraftRevision(chapterId, job.job_id);
      if (result?.revision?.content) {
        onApplyContent(result.revision.content);
      }
      setJob(null);
      await loadRevisions();
    } catch (err: unknown) {
      alert(`Chấp nhận bản thảo thất bại: ${err instanceof Error ? err.message : 'Không rõ nguyên nhân'}`);
    } finally {
      setAccepting(false);
    }
  };

  const handleDiscardDraft = () => {
    setJob(null);
    setJobError(null);
  };

  const operationLabels: Record<WritingOperation, string> = {
    continue: 'Tiếp tục',
    rewrite: 'Viết lại',
    describe: 'Miêu tả',
    dialogue: 'Hội thoại'
  };

  const hasValidationErrors = job?.validations?.some((v) => !v.passed);
  const isValid = job?.validation_status === 'passed' || (job?.validations && job.validations.length > 0 && !hasValidationErrors);

  return (
    <Paper className="assistant-panel" radius={0} p="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconBrain size={20} color="#7950f2" />
          <Text fw={700}>Writing Copilot (P6)</Text>
        </Group>
        <Badge variant="light" color="violet">Loop v1</Badge>
      </Group>

      <Stack gap="sm">
        {/* Operation Selection */}
        <Box>
          <Text size="xs" fw={600} mb={4} c="dimmed">CHẾ ĐỘ TÁC VỤ</Text>
          <SegmentedControl
            fullWidth
            size="xs"
            value={operation}
            onChange={(val) => setOperation(val as WritingOperation)}
            data={[
              { label: operationLabels.continue, value: 'continue' },
              { label: operationLabels.rewrite, value: 'rewrite' },
              { label: operationLabels.describe, value: 'describe' },
              { label: operationLabels.dialogue, value: 'dialogue' }
            ]}
          />
        </Box>

        {/* Instruction textarea */}
        <Textarea
          label="Chỉ dẫn viết"
          placeholder="Nhập yêu cầu triển khai bối cảnh, nhân vật hoặc phong cách..."
          minRows={3}
          autosize
          value={instruction}
          onChange={(e) => setInstruction(e.currentTarget.value)}
        />

        {/* Action Buttons */}
        <Group grow gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconEye size={14} />}
            onClick={handleOpenContextPreview}
            disabled={!novelId}
          >
            Xem bối cảnh
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconCamera size={14} />}
            loading={snapshotLoading}
            onClick={handleCreateSnapshot}
            disabled={!chapterId}
          >
            Bản chụp
          </Button>
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconHistory size={14} />}
            onClick={() => setRevisionsModalOpened(true)}
            disabled={!chapterId}
          >
            Lịch sử ({revisions.length})
          </Button>
        </Group>

        <Button
          fullWidth
          size="sm"
          color="violet"
          leftSection={<IconSparkles size={16} />}
          loading={generating}
          disabled={!novelId || !chapterId || !instruction.trim()}
          onClick={handleStartGeneration}
        >
          {generating ? 'Đang phân tích & sinh bản thảo...' : 'Sinh bản thảo'}
        </Button>

        {/* Error message */}
        {jobError && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Lỗi sinh bản thảo" withCloseButton onClose={() => setJobError(null)}>
            {jobError}
          </Alert>
        )}

        {/* Job Active Progress */}
        {generating && job && (
          <Paper p="xs" withBorder>
            <Group justify="space-between" mb={4}>
              <Text size="xs" fw={600}>Giai đoạn: {job.stage || 'Xử lý'}</Text>
              <Badge size="xs" color="blue">{job.status}</Badge>
            </Group>
            <Progress value={job.stage === 'validation' ? 80 : 50} animated size="sm" color="violet" />
          </Paper>
        )}

        {/* Diff & Validation Preview Card */}
        {job && job.status?.toLowerCase() === 'completed' && (
          <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-8, #1a1b1e)' }}>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={700}>Bản thảo đề xuất (Diff Preview)</Text>
              <Badge color={isValid ? 'teal' : 'red'}>
                {isValid ? 'Xác thực: Hợp lệ' : 'Vi phạm quy tắc'}
              </Badge>
            </Group>

            {/* Validation Details */}
            {hasValidationErrors ? (
              <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="xs" title="Cảnh báo kiểm tra quy tắc">
                <Stack gap={4}>
                  {job.validations.filter(v => !v.passed).map((val, idx) => (
                    <Text key={idx} size="xs">
                      • <strong>[{val.code}]</strong>: {val.message}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            ) : (
              <Alert color="teal" icon={<IconCheck size={16} />} mb="xs">
                <Text size="xs">Đã kiểm tra quy luật cốt truyện & trạng thái nhân vật: Không vi phạm.</Text>
              </Alert>
            )}

            {/* Diff View */}
            <Box mb="xs">
              <Text size="xs" c="dimmed" mb={2}>ĐOẠN GỐC (TARGET RANGE):</Text>
              <Paper p="xs" withBorder style={{ maxHeight: 90, overflowY: 'auto' }}>
                <Code block style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                  {job.patch
                    ? editorContent.slice(job.patch.start, job.patch.end) || '(Chèn vào vị trí con trỏ)'
                    : '(Thay thế toàn bộ hoặc phần cuối)'}
                </Code>
              </Paper>
            </Box>

            <Box mb="md">
              <Text size="xs" c="dimmed" mb={2}>NỘI DUNG MỚI (REPLACEMENT):</Text>
              <Paper p="xs" withBorder style={{ maxHeight: 150, overflowY: 'auto' }}>
                <Code block color="violet" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                  {job.patch?.replacement ?? job.draft ?? ''}
                </Code>
              </Paper>
            </Box>

            {/* Acceptance Buttons */}
            <Group grow>
              <Button
                size="xs"
                color="teal"
                leftSection={<IconCheck size={14} />}
                loading={accepting}
                disabled={hasValidationErrors}
                onClick={handleAcceptDraft}
              >
                Chấp nhận bản thảo
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconX size={14} />}
                onClick={handleDiscardDraft}
              >
                Hủy
              </Button>
            </Group>
          </Paper>
        )}
      </Stack>

      {/* Context Preview Modal */}
      <Modal
        opened={previewModalOpened}
        onClose={() => setPreviewModalOpened(false)}
        title="Xem trước bối cảnh (Story Brain Context)"
        size="lg"
      >
        {previewLoading && <Text size="sm">Đang nạp bối cảnh từ AI Service...</Text>}
        {previewError && <Alert color="red">{previewError}</Alert>}
        {previewData && (
          <Stack gap="md">
            <Paper p="xs" withBorder>
              <Group justify="space-between">
                <Text size="xs" fw={700}>Token Budget</Text>
                <Badge size="sm" variant="light">
                  {previewData.token_budget.used} / {previewData.token_budget.maximum} tokens
                </Badge>
              </Group>
              <Progress
                mt="xs"
                value={(previewData.token_budget.used / previewData.token_budget.maximum) * 100}
                color="violet"
              />
            </Paper>

            <Box>
              <Text size="sm" fw={700} mb="xs">
                Nhân vật trong bối cảnh ({previewData.entities.length})
              </Text>
              <ScrollArea h={120}>
                <Stack gap={4}>
                  {previewData.entities.map((ent) => (
                    <Group key={ent.entity_id} justify="space-between">
                      <Group gap="xs">
                        <Text size="xs" fw={600}>{ent.name}</Text>
                        <Badge size="xs" variant="outline">{ent.status}</Badge>
                      </Group>
                      <Text size="xs" c="dimmed">{ent.location || 'Chưa rõ vị trí'}</Text>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea>
            </Box>

            <Divider />

            <Box>
              <Text size="sm" fw={700} mb="xs">
                Quy tắc thế giới ({previewData.world_rules?.length ?? 0})
              </Text>
              <ScrollArea h={100}>
                <Stack gap={4}>
                  {previewData.world_rules?.length ? (
                    previewData.world_rules.map((rule, idx) => (
                      <Paper key={rule.id ?? idx} p={6} withBorder>
                        <Group justify="space-between">
                          <Text size="xs">{rule.statement ?? rule.summary ?? rule.description}</Text>
                          {rule.is_locked ? <Badge size="xs" color="red">LOCKED</Badge> : null}
                        </Group>
                      </Paper>
                    ))
                  ) : (
                    <Text size="xs" c="dimmed">Không có quy tắc khóa nào.</Text>
                  )}
                </Stack>
              </ScrollArea>
            </Box>

            <Divider />

            <Box>
              <Text size="sm" fw={700} mb="xs">
                Sự kiện gần nhất ({previewData.recent_events.length})
              </Text>
              <ScrollArea h={100}>
                <Stack gap={4}>
                  {previewData.recent_events.map((ev) => (
                    <Text key={ev.event_id} size="xs" c="dimmed">
                      • [Ch.{ev.chapter_number}] {ev.summary}
                    </Text>
                  ))}
                </Stack>
              </ScrollArea>
            </Box>
          </Stack>
        )}
      </Modal>

      {/* Revision History Modal */}
      <Modal
        opened={revisionsModalOpened}
        onClose={() => setRevisionsModalOpened(false)}
        title="Lịch sử bản chụp chương (Revisions)"
        size="md"
      >
        {revisionsLoading ? (
          <Text size="sm">Đang tải lịch sử...</Text>
        ) : revisions.length === 0 ? (
          <Text size="sm" c="dimmed">Chưa có bản chụp nào được lưu.</Text>
        ) : (
          <ScrollArea h={320}>
            <Stack gap="xs">
              {revisions.map((rev, index) => (
                <Paper key={rev.revisionId} p="xs" withBorder>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Badge size="xs" variant="filled">#{revisions.length - index}</Badge>
                      <Badge size="xs" color={rev.sourceType === 'AI_DRAFT_ACCEPT' ? 'violet' : 'blue'}>
                        {rev.sourceType}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">{new Date(rev.createdAt).toLocaleString('vi-VN')}</Text>
                  </Group>
                  <Text size="xs" mt={4} c="dimmed">
                    Số từ: {rev.wordCount} · Hash: {rev.contentHash.slice(0, 10)}...
                  </Text>
                </Paper>
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Modal>
    </Paper>
  );
}
