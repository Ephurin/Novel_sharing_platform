import { navigationHref } from '../../shared/routes';
import { AnimatedStepper, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { NormalizationPreview, SplitPresets } from './ManuscriptTools';
import { duplicateChapterGroups, splitPatternError } from './manuscript-tools';
import { SelectionToolbar } from '../../shared/components/InteractionWidgets';
import { AnimatedProgress } from '../../shared/components/AnimatedProgress';
import { AnimatedCheckbox } from '../../shared/components/AnimatedCheckIcon';
import { useToast } from '../../shared/components/ToastProvider';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { Breadcrumbs } from '../../shared/components/Breadcrumbs';
import { authorHomeCrumb } from '../../shared/components/navigation';
import { AnimatedDisclosure } from '../../shared/components/AnimatedDisclosure';
import { LoadingState } from '../../shared/components/PageStates';
import NumberFlow from '@number-flow/react';
import { useReducedMotion } from 'motion/react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getNovel, listChapters } from '../novels/novel-api';
import { EntityExtractionReview } from '../ai-copilot/EntityExtractionReview';
import { getEntityReviews } from '../ai-copilot/author-memory-api';
import {
  acceptProposalGroup,
  activateBaseline,
  baselineActivationBlockedMessage,
  describeProposal,
  summarizeProposalGroup,
  getBootstrapJob,
  getReviewQueue,
  getStoryBrainSummary,
  jobErrorLabel,
  jobStageLabel,
  jobStatusLabel,
  nextChapterBlockedMessage,
  rejectProposal,
  resumeBootstrapJob,
  startManuscriptBootstrap,
  parseManuscriptChapters,
  normalizeManuscriptText,
  importChaptersBatch,
  ManuscriptImportError,
  type BootstrapRevisionInput,
  type ParsedChapterItem,
  type ReviewProposal
} from './manuscript-import-api';

export function ManuscriptImportPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const novelQuery = useQuery({
    queryKey: ['novel', novelId],
    queryFn: () => getNovel(novelId),
    enabled: Boolean(novelId)
  });

  const chaptersQuery = useQuery({
    queryKey: ['chapters', novelId],
    queryFn: () => listChapters(novelId),
    enabled: Boolean(novelId)
  });

  const existingChapterCount = chaptersQuery.data?.length ?? 0;
  const startingChapterNumber = existingChapterCount + 1;

  const [searchParams, setSearchParams] = useSearchParams();
  const queryJobId = searchParams.get('jobId');
  const queryStep = Number(searchParams.get('step'));
  // Stepper state (1: Upload, 2: Analyze & Preview, 3: Confirm Import)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(
    queryStep === 1 || queryStep === 2 || queryStep === 3 ? queryStep : queryJobId ? 3 : 1
  );

  // File & modal state
  const [fileName, setFileName] = useState('');
  const [fileSizeStr, setFileSizeStr] = useState('');
  const [rawText, setRawText] = useState('');
  const [fileReadProgress, setFileReadProgress] = useState<number | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileReaderRef = useRef<FileReader | null>(null);
  useEffect(() => () => fileReaderRef.current?.abort(), []);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [tempPasteText, setTempPasteText] = useState('');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);

  const closePasteModal = () => {
    setPasteModalOpen(false);
    setEditingChapterId(null);
  };

  // Regex & Splitting Config
  const defaultRegex = '/(?:Chương|Hồi|Chapter|Phần)\\s+\\d+[:\\s\\.\\-—]?.*(?=\\n|$)/gm';
  const [regexInput, setRegexInput] = useState(defaultRegex);
  const [appliedRegex, setAppliedRegex] = useState(defaultRegex);

  // Normalization options
  const [normalizePunctuation, setNormalizePunctuation] = useState(true);
  const [removeExtraBlankLines, setRemoveExtraBlankLines] = useState(true);
  const [preserveDialogue, setPreserveDialogue] = useState(true);

  // Story Brain AI option
  const [enableStoryBrainAi, setEnableStoryBrainAi] = useState(true);

  // Parsed chapters & UI selection state
  const [parsedChapters, setParsedChapters] = useState<ParsedChapterItem[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [previewChapterId, setPreviewChapterId] = useState<string | null>(null);

  // Pagination for chapter table
  const [currentPage, setCurrentPage] = useState(1);
  const [onlyInvalid, setOnlyInvalid] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const jumpFocus = useRef<string | null>(null);
  const pageSize = 6;

  // Toast message
  const { showToast } = useToast();

  // Import Execution State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importSummary, setImportSummary] = useState<{
    total: number;
    completed: string[];
    failed?: string;
    unattempted: number;
    message?: string;
    snapshotFailed?: boolean;
  } | null>(null);

  // Story Brain Job & Review State
  const [jobId, setJobId] = useState<string | null>(queryJobId);

  const jobQuery = useQuery({
    queryKey: ['manuscript-bootstrap-job', jobId],
    queryFn: () => getBootstrapJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.status ?? '')
        ? 1000
        : query.state.data?.status === 'waiting_entity_review'
          ? 5000
          : false
  });

  const reviewQuery = useQuery({
    queryKey: ['manuscript-review-queue', novelId],
    queryFn: () => getReviewQueue(novelId),
    enabled: Boolean(
      novelId &&
        (['waiting_review', 'waiting_entity_review'].includes(jobQuery.data?.status ?? '') || currentStep === 3)
    )
  });

  const brainQuery = useQuery({
    queryKey: ['story-brain-summary', novelId],
    queryFn: () => getStoryBrainSummary(novelId),
    enabled: Boolean(novelId)
  });

  const normalizedText = useMemo(
    () => normalizeManuscriptText(rawText, { normalizePunctuation, removeExtraBlankLines, preserveDialogue }),
    [rawText, normalizePunctuation, removeExtraBlankLines, preserveDialogue]
  );

  // Re-parse when text, regex, or normalizations change
  useEffect(() => {
    const parsed = parseManuscriptChapters(normalizedText, appliedRegex, startingChapterNumber);
    setParsedChapters(parsed);
    setSelectedChapterIds(parsed.map((c) => c.id));
    if (parsed.length > 0 && (!previewChapterId || !parsed.some((c) => c.id === previewChapterId))) {
      setPreviewChapterId(parsed[0].id);
    }
  }, [
    normalizedText,
    appliedRegex,
    normalizePunctuation,
    removeExtraBlankLines,
    preserveDialogue,
    startingChapterNumber
  ]);

  // Statistics
  const totalWords = useMemo(
    () => parsedChapters.reduce((acc, c) => acc + c.wordCount, 0),
    [parsedChapters]
  );
  const invalidChaptersCount = useMemo(
    () => parsedChapters.filter((c) => !c.isValid).length,
    [parsedChapters]
  );

  const duplicateGroups = useMemo(() => duplicateChapterGroups(parsedChapters), [parsedChapters]);
  const duplicateIds = useMemo(() => new Set(duplicateGroups.flat()), [duplicateGroups]);
  const deselectDuplicateCopies = () => {
    setSelectedChapterIds((selected) => {
      const removed = new Set<string>();
      for (const group of duplicateGroups) {
        const chosen = group.filter((id) => selected.includes(id));
        chosen.slice(1).forEach((id) => removed.add(id));
      }
      return selected.filter((id) => !removed.has(id));
    });
  };

  // Paginated chapters for the table
  const visibleChapters = useMemo(
    () =>
      parsedChapters.filter(
        (ch) => (!onlyInvalid || !ch.isValid) && (!onlyDuplicates || duplicateIds.has(ch.id))
      ),
    [parsedChapters, onlyInvalid, onlyDuplicates, duplicateIds]
  );
  const totalPages = Math.ceil(visibleChapters.length / pageSize) || 1;
  const paginatedChapters = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return visibleChapters.slice(start, start + pageSize);
  }, [visibleChapters, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!jumpFocus.current) return;
    const id = jumpFocus.current;
    jumpFocus.current = null;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(`[data-chapter-title="${CSS.escape(id)}"]`)?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [currentPage, previewChapterId, onlyInvalid, onlyDuplicates]);

  const nextInvalid = () => {
    const candidates = parsedChapters.filter((ch) => !ch.isValid);
    if (!candidates.length) return;
    const current = candidates.findIndex((ch) => ch.id === previewChapterId);
    const next = candidates[(current + 1) % candidates.length];
    setOnlyDuplicates(false);
    jumpFocus.current = next.id;
    setPreviewChapterId(next.id);
    setCurrentPage(
      Math.floor((onlyInvalid ? candidates : parsedChapters).findIndex((ch) => ch.id === next.id) / pageSize) + 1
    );
    if (next.id === previewChapterId) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLInputElement>(`[data-chapter-title="${CSS.escape(next.id)}"]`)?.focus()
      );
    }
  };

  // Active preview chapter
  const activePreviewChapter = useMemo(() => {
    return parsedChapters.find((c) => c.id === previewChapterId) || parsedChapters[0] || null;
  }, [parsedChapters, previewChapterId]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedChapterIds(parsedChapters.map((c) => c.id));
    } else {
      setSelectedChapterIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Update chapter title inline
  const handleUpdateTitle = (id: string, newTitle: string) => {
    setParsedChapters((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const meaningful =
          newTitle.trim().length > 3 &&
          !newTitle.includes('[Chưa có tên]') &&
          !newTitle.includes('[Không tên]');
        return {
          ...c,
          title: newTitle,
          isValid: meaningful && c.wordCount > 0,
          validationMessage: !meaningful
            ? 'Thiếu tiêu đề chương'
            : c.wordCount === 0
              ? 'Nội dung chương trống'
              : undefined
        };
      })
    );
  };

  // Auto re-sequence chapter titles
  const handleAutoRenumber = () => {
    setParsedChapters((prev) =>
      prev.map((c, idx) => {
        const destNum = startingChapterNumber + idx;
        const currentTitle = c.title;
        const replaced = currentTitle.replace(
          /^(Chương|Hồi|Chapter|Phần)\s+\d+[:\s\.\-—]*/i,
          `Chương ${destNum}: `
        );
        const finalTitle = replaced === currentTitle ? `Chương ${destNum}: ${currentTitle}` : replaced;
        return {
          ...c,
          targetNumber: destNum,
          title: finalTitle,
          isValid: c.wordCount > 0,
          validationMessage: c.wordCount === 0 ? 'Nội dung chương trống' : undefined
        };
      })
    );
    showToast('Đã tự động đánh lại số thứ tự nối tiếp!');
  };

  const loadManuscriptFile = (file: File) => {
    fileReaderRef.current?.abort();
    setIsReadingFile(true);
    setFileReadProgress(0);
    setImportProgress({ current: 0, total: 0 });
    setFileName(file.name);
    const sizeKb = Math.round(file.size / 1024);
    setFileSizeStr(
      sizeKb > 1024
        ? `${(sizeKb / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
        : `${sizeKb.toLocaleString('vi-VN')} KB`
    );

    const reader = new FileReader();
    fileReaderRef.current = reader;
    reader.onprogress = (event) => {
      setFileReadProgress(event.lengthComputable && event.total > 0 ? (event.loaded / event.total) * 100 : null);
    };
    reader.onload = (event) => {
      const content = event.target?.result;
      // UAT 2026-11-21 (BUG-009): an empty file used to "succeed" with 0 characters.
      if (typeof content === 'string' && !content.trim()) {
        setIsReadingFile(false);
        setFileReadProgress(null);
        setFileName('');
        showToast(`Tệp "${file.name}" không có nội dung. Hãy chọn tệp có văn bản chương.`, 'error');
        return;
      }
      if (typeof content === 'string') {
        setIsReadingFile(false);
        setFileReadProgress(100);
        setImportSummary(null);
        setRawText(content);
        setCurrentStep(2);
        showToast(`Đã tải lên "${file.name}" và phân tích ${content.length.toLocaleString('vi-VN')} ký tự!`);
      }
    };
    reader.onerror = () => {
      setIsReadingFile(false);
      setFileReadProgress(null);
      showToast('Lỗi khi đọc tệp. Vui lòng thử lại với tệp định dạng .txt, .md hoặc .json', 'error');
    };
    reader.readAsText(file);
  };

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadManuscriptFile(file);
  };

  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.(txt|md|json)$/i.test(file.name)) {
      showToast('Vui lòng chọn tệp định dạng .txt, .md hoặc .json', 'error');
      return;
    }
    loadManuscriptFile(file);
  };

  // Mutations: Story Brain Bootstrap & Review
  const startBootstrapMutation = useMutation({
    mutationFn: async (revisions: BootstrapRevisionInput[]) => {
      return startManuscriptBootstrap(novelId, revisions);
    },
    onSuccess: (result) => {
      setJobId(result.job_id);
      setSearchParams({ jobId: result.job_id, step: '3' });
      showToast('Đã bắt đầu phân tích Story Brain AI! Đang tiến hành quét các chương...');
    },
    onError: (err: any) => {
      showToast('Lỗi Story Brain: ' + (err?.message || 'Không thể bắt đầu phân tích AI'), 'error');
    }
  });

  const acceptMutation = useMutation({
    mutationFn: ({ groupId, proposals }: { groupId: string; proposals: ReviewProposal[] }) =>
      acceptProposalGroup(
        groupId,
        proposals.map((item) => item.proposal_id),
        brainQuery.data?.brain_version ?? 1
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] }),
        queryClient.invalidateQueries({ queryKey: ['story-brain-summary', novelId] })
      ]);
      showToast('Đã duyệt nhóm đề xuất AI!');
    },
    onError: (err: any) => showToast('Lỗi duyệt đề xuất: ' + (err?.message || 'Thất bại'), 'error')
  });

  const rejectMutation = useMutation({
    mutationFn: (proposals: ReviewProposal[]) =>
      Promise.all(proposals.map((item) => rejectProposal(item.proposal_id))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] });
      showToast('Đã từ chối đề xuất AI.');
    },
    onError: (err: any) => showToast('Lỗi từ chối đề xuất: ' + (err?.message || 'Thất bại'), 'error')
  });

  const nextChapterMutation = useMutation({
    mutationFn: () => resumeBootstrapJob(jobId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manuscript-bootstrap-job', jobId] });
      showToast('Đang phân tích chương tiếp theo…');
    },
    onError: (err: any) =>
      showToast(nextChapterBlockedMessage(err) ?? 'Không thể tiếp tục: ' + (err?.message || 'Thất bại'), 'error')
  });

  const awaitingRunId =
    jobQuery.data?.status === 'waiting_entity_review' ? jobQuery.data.result?.awaiting_analysis_run_id : undefined;
  const entityReviewsQuery = useQuery({
    queryKey: ['import-entity-reviews', novelId],
    queryFn: () => getEntityReviews(novelId),
    enabled: Boolean(novelId && (awaitingRunId || jobQuery.data?.status === 'waiting_review')),
    refetchInterval: awaitingRunId || jobQuery.data?.status === 'waiting_review' ? 4000 : false
  });
  const finalReviewPending =
    jobQuery.data?.status === 'waiting_review' &&
    (!entityReviewsQuery.isSuccess || (entityReviewsQuery.data ?? []).length > 0);
  const pausedAt = useMemo(() => Date.now(), [awaitingRunId]);
  const chapterReviewPending =
    Boolean(awaitingRunId) &&
    (!entityReviewsQuery.isSuccess ||
      entityReviewsQuery.dataUpdatedAt < pausedAt ||
      (entityReviewsQuery.data ?? []).some((r) => r.analysis_run_id === awaitingRunId));

  const reviewAction = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-entity-reviews', novelId] });
      queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] });
    },
    onError: (err: any) =>
      showToast('Không lưu được bước duyệt nhân vật: ' + (err?.message || 'Thất bại'), 'error')
  });
  const autoAdvancedFor = useRef<string | null>(null);

  const retryMutation = useMutation({
    mutationFn: () => resumeBootstrapJob(jobId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manuscript-bootstrap-job', jobId] });
      showToast('Đang thử lại từ chương còn dở…');
    },
    onError: (err: any) => showToast('Không thể thử lại: ' + (err?.message || 'Thất bại'), 'error')
  });

  const activateMutation = useMutation({
    mutationFn: () => activateBaseline(novelId, jobId!),
    onSuccess: () => {
      showToast('Đã kích hoạt Story Brain baseline thành công! Sẵn sàng trong Studio.');
      queryClient.invalidateQueries({ queryKey: ['story-brain-summary', novelId] });
      queryClient.invalidateQueries({ queryKey: ['manuscript-bootstrap-job', jobId] });
    },
    onError: (err: any) =>
      showToast(
        baselineActivationBlockedMessage(err) ?? 'Lỗi kích hoạt baseline: ' + (err?.message || 'Thất bại'),
        'error'
      )
  });

  // Main Action: Confirm Import Chapters to Novel
  const handleConfirmImport = async () => {
    const toImport = parsedChapters.filter((c) => selectedChapterIds.includes(c.id));
    if (toImport.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 chương để nhập!', 'error');
      return;
    }

    setIsImporting(true);
    setImportSummary(null);
    setImportProgress({ current: 0, total: toImport.length });

    try {
      const importedResults = await importChaptersBatch(
        novelId,
        toImport.map((c) => ({
          title: c.title.trim(),
          content: c.content,
          isVip: false,
          priceCoins: 0
        })),
        (curr, tot) => setImportProgress({ current: curr, total: tot })
      );
      setImportSummary({
        total: toImport.length,
        completed: toImport.map((ch) => ch.title),
        unattempted: 0
      });

      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
      showToast(`Đã nhập thành công ${importedResults.length.toLocaleString('vi-VN')} chương vào tác phẩm!`);

      if (enableStoryBrainAi && importedResults.length > 0) {
        const revisions: BootstrapRevisionInput[] = importedResults.map((item) => ({
          chapter_id: item.chapter.chapterId,
          revision_id: item.revision.revisionId,
          content_hash: item.revision.contentHash
        }));
        try {
          await startBootstrapMutation.mutateAsync(revisions);
        } catch {
          // Handled in mutation onError
        }
      }

      setCurrentStep(3);
    } catch (err: any) {
      if (err instanceof ManuscriptImportError) {
        setImportSummary({
          total: toImport.length,
          completed: toImport.slice(0, err.completed.length).map((ch) => ch.title),
          failed: toImport[err.failedIndex]?.title,
          unattempted: toImport.length - err.failedIndex - 1,
          message: err.message,
          snapshotFailed: err.stage === 'snapshot'
        });
      } else {
        setImportSummary({
          total: toImport.length,
          completed: [],
          unattempted: toImport.length,
          message: err?.message || 'Không thể xác định kết quả nhập.'
        });
      }
      showToast('Lỗi nhập chương: ' + (err?.message || 'Không thể nhập toàn bộ chương'), 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Grouped review proposals
  const reviewGroups = useMemo(() => {
    const grouped = new Map<string, ReviewProposal[]>();
    for (const proposal of reviewQuery.data ?? []) {
      const key = proposal.dependency_group_id || proposal.proposal_id;
      grouped.set(key, [...(grouped.get(key) ?? []), proposal]);
    }
    return [...grouped.entries()];
  }, [reviewQuery.data]);

  useEffect(() => {
    if (!awaitingRunId || chapterReviewPending || !reviewQuery.isSuccess || reviewQuery.isFetching) return;
    if (reviewQuery.dataUpdatedAt <= entityReviewsQuery.dataUpdatedAt) {
      queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] });
      return;
    }
    if (reviewGroups.length > 0 || autoAdvancedFor.current === awaitingRunId || nextChapterMutation.isPending) return;
    autoAdvancedFor.current = awaitingRunId;
    nextChapterMutation.mutate();
  }, [
    awaitingRunId,
    chapterReviewPending,
    reviewQuery.isSuccess,
    reviewQuery.isFetching,
    reviewQuery.dataUpdatedAt,
    entityReviewsQuery.dataUpdatedAt,
    reviewGroups.length
  ]);

  const job = jobQuery.data;
  const jobPercent = job?.progress?.total ? Math.round((job.progress.current / job.progress.total) * 100) : 0;
  const novel = novelQuery.data;

  const hasManuscriptData = rawText.trim().length > 0 || parsedChapters.length > 0;
  const hasStep3Context = Boolean(importSummary || jobId || job || hasManuscriptData);
  const showStep1Focused =
    currentStep === 1 || (!hasManuscriptData && !jobId && !job && !importSummary);
  const importedCount = importSummary?.completed.length ?? 0;
  const isImportCompleteSuccess = Boolean(importSummary && !importSummary.message && importedCount > 0);
  const isPartialImportFailure = Boolean(importSummary?.message && importedCount > 0);

  const handleStepSelect = (nextStep: number) => {
    const target = nextStep as 1 | 2 | 3;
    if (target === 1) {
      setCurrentStep(1);
      return;
    }
    if (target === 2) {
      if (!hasManuscriptData) {
        showToast('Hãy tải tệp hoặc dán bản thảo trước khi xem trước.', 'error');
        return;
      }
      setCurrentStep(2);
      return;
    }
    if (!hasStep3Context) {
      showToast('Hãy tải tệp hoặc dán bản thảo trước khi xác nhận nhập.', 'error');
      return;
    }
    setCurrentStep(3);
  };

  const openFullPasteModal = () => {
    setEditingChapterId(null);
    setTempPasteText(rawText);
    setPasteModalOpen(true);
  };

  const handleSavePasteModal = () => {
    if (editingChapterId) {
      const trimmed = tempPasteText.trim();
      const nextWordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
      setParsedChapters((prev) =>
        prev.map((ch) => {
          if (ch.id !== editingChapterId) return ch;
          const meaningful =
            ch.title.trim().length > 3 &&
            !ch.title.includes('[Chưa có tên]') &&
            !ch.title.includes('[Không tên]');
          return {
            ...ch,
            content: trimmed,
            wordCount: nextWordCount,
            isValid: meaningful && nextWordCount > 0,
            validationMessage: !meaningful
              ? 'Thiếu tiêu đề chương'
              : nextWordCount === 0
                ? 'Nội dung chương trống'
                : undefined
          };
        })
      );
      closePasteModal();
      showToast('Đã cập nhật nội dung chương!');
      return;
    }

    setFileReadProgress(null);
    setImportProgress({ current: 0, total: 0 });
    setImportSummary(null);
    setRawText(tempPasteText);
    setFileName('manuscript_pasted_content.txt');
    setFileSizeStr(`${Math.round(tempPasteText.length / 1024).toLocaleString('vi-VN')} KB`);
    closePasteModal();
    if (tempPasteText.trim()) setCurrentStep(2);
    showToast('Đã cập nhật nội dung bản thảo từ văn bản vừa dán!');
  };

  if (novelQuery.isLoading) {
    return (
      <>
        <AuthorNavbar />
        <main className="sc-shell-content">
          <LoadingState label="Đang tải thông tin tác phẩm…" />
        </main>
      </>
    );
  }

  const advancedSettingsDisclosure = (
    <AnimatedDisclosure
      summary="Cấu hình nâng cao"
      summaryClassName="text-body font-semibold text-stone-800"
      className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200"
    >
      <div className="flex flex-col gap-4 mt-4">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary-600 text-[18px]" aria-hidden="true">tune</span>
            <h2 className="text-meta font-bold text-stone-900">Cấu hình tách chương</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setRegexInput(defaultRegex);
              setAppliedRegex(defaultRegex);
              showToast('Đã khôi phục quy tắc tách mặc định!');
            }}
            className="text-meta text-primary-600 hover:underline font-medium cursor-pointer"
          >
            Khôi phục mặc định
          </button>
        </div>

        {/* Regex Input */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="manuscript-regex-input" className="text-meta font-semibold text-stone-700">
              Quy tắc nhận diện (Regex)
            </label>
            <span className="text-stone-500 text-meta font-medium">
              Khớp {parsedChapters.length.toLocaleString('vi-VN')} vị trí
            </span>
          </div>
          <div className="flex gap-1.5">
            <input
              id="manuscript-regex-input"
              type="text"
              spellCheck={false}
              aria-label="Quy tắc nhận diện Regex"
              value={regexInput}
              onChange={(e) => setRegexInput(e.target.value)}
              className="flex-1 bg-stone-50 text-stone-900 font-mono text-meta rounded-lg px-2.5 py-1.5 border border-stone-200 focus:outline-none focus:bg-surface-container-lowest focus:border-primary-600 focus:ring-1 focus:ring-primary-600"
            />
            <button
              type="button"
              onClick={() => {
                const error = splitPatternError(regexInput);
                if (error) {
                  showToast(error, 'error');
                  return;
                }
                setAppliedRegex(regexInput);
                showToast(`Đã áp dụng quy tắc tách: ${regexInput}`);
              }}
              className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-on-primary text-meta font-semibold shadow-2xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-body" aria-hidden="true">play_arrow</span>
              <span>Áp dụng</span>
            </button>
          </div>
        </div>

        <SplitPresets
          disabled={isImporting}
          current={{ pattern: regexInput, normalizePunctuation, removeExtraBlankLines, preserveDialogue }}
          onApply={(preset) => {
            setRegexInput(preset.pattern);
            setAppliedRegex(preset.pattern);
            setNormalizePunctuation(preset.normalizePunctuation);
            setRemoveExtraBlankLines(preset.removeExtraBlankLines);
            setPreserveDialogue(preset.preserveDialogue);
          }}
        />

        {/* Common Presets */}
        <div className="flex flex-col gap-1.5">
          <span className="text-meta text-stone-500 font-medium">Mẫu quy tắc phổ biến:</span>
          <div className="flex flex-wrap gap-1.5">
            {[
              {
                label: 'Chương \\d+:?.*',
                pattern: '/(?:^|\\n)\\s*(?:Chương|chuong)\\s+\\d+[:\\s\\.\\-—]?.*(?=\\n|$)/gim'
              },
              {
                label: 'Hồi \\d+:?.*',
                pattern: '/(?:^|\\n)\\s*(?:Hồi|hoi)\\s+\\d+[:\\s\\.\\-—]?.*(?=\\n|$)/gim'
              },
              {
                label: 'Chapter \\d+[:\\-]?.*',
                pattern: '/(?:^|\\n)\\s*(?:Chapter|chap)\\s+\\d+[:\\s\\.\\-—]?.*(?=\\n|$)/gim'
              },
              {
                label: 'Phần [IVXLCDM]+.*',
                pattern: '/(?:^|\\n)\\s*(?:Phần|phan)\\s+[IVXLCDMivxlcdm]+[:\\s\\.\\-—]?.*(?=\\n|$)/gim'
              }
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setRegexInput(preset.pattern);
                  setAppliedRegex(preset.pattern);
                  showToast(`Đã chọn mẫu: ${preset.label}`);
                }}
                className={`px-2 py-0.5 rounded text-meta font-mono transition-colors cursor-pointer border ${
                  appliedRegex === preset.pattern
                    ? 'bg-primary-600 text-on-primary border-primary-600 font-semibold'
                    : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Text Normalization Options */}
        <div className="pt-2 border-t border-stone-100 flex flex-col gap-2.5">
          <span className="text-meta text-stone-500 font-bold">
            Chuẩn hóa văn bản đầu vào
          </span>
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <AnimatedCheckbox
              checked={normalizePunctuation}
              onChange={(e) => setNormalizePunctuation(e.target.checked)}
              className="shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-meta text-stone-800 group-hover:text-primary-600 font-medium transition-colors">
                Chuẩn hóa dấu câu tiếng Việt
              </span>
              <span className="text-meta text-stone-500">
                Ngoặc kép cong “...”, ba chấm …, khoảng trắng dấu thanh.
              </span>
            </div>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <AnimatedCheckbox
              checked={removeExtraBlankLines}
              onChange={(e) => setRemoveExtraBlankLines(e.target.checked)}
              className="shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-meta text-stone-800 group-hover:text-primary-600 font-medium transition-colors">
                Loại bỏ dòng trống dư thừa
              </span>
              <span className="text-meta text-stone-500">
                Gộp nhiều ngắt dòng liên tiếp thành đoạn văn chuẩn.
              </span>
            </div>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <AnimatedCheckbox
              checked={preserveDialogue}
              onChange={(e) => setPreserveDialogue(e.target.checked)}
              className="shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-meta text-stone-800 group-hover:text-primary-600 font-medium transition-colors">
                Bảo lưu định dạng thoại
              </span>
              <span className="text-meta text-stone-500">
                Bảo lưu gạch đầu dòng đối thoại và in nghiêng nội tâm.
              </span>
            </div>
          </label>
        </div>

        {rawText && <NormalizationPreview original={rawText} normalized={normalizedText} />}

        {/* AI Story Brain Toggle */}
        <div className="pt-2 border-t border-stone-100 flex flex-col gap-1.5">
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <AnimatedCheckbox
              checked={enableStoryBrainAi}
              onChange={(e) => setEnableStoryBrainAi(e.target.checked)}
              className="shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-meta text-stone-800 group-hover:text-primary-600 font-semibold transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-primary-600" aria-hidden="true">psychology</span>
                Kích hoạt Story Brain AI
              </span>
              <span className="text-meta text-stone-500">
                Tự động trích xuất thực thể, bối cảnh thế giới và tạo hàng đợi đối chiếu AI.
              </span>
            </div>
          </label>
        </div>
      </div>
    </AnimatedDisclosure>
  );

  const actionConfirmationBar = (
    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-start gap-3 max-w-xl">
        <span className="material-symbols-outlined text-primary-600 text-[20px] shrink-0 mt-0.5" aria-hidden="true">
          info
        </span>
        <div className="flex flex-col">
          <p className="text-meta text-stone-600 leading-relaxed">
            Các chương sau khi nhập sẽ được lưu ở trạng thái{' '}
            <strong className="text-stone-900">Bản nháp</strong> trong tác phẩm{' '}
            <strong>{novel?.title}</strong> và không tự động xuất bản.
          </p>
          <span className="text-meta text-primary-600 font-semibold mt-0.5">
            Đã chọn {selectedChapterIds.length.toLocaleString('vi-VN')} chương •{' '}
            {invalidChaptersCount > 0
              ? `${invalidChaptersCount.toLocaleString('vi-VN')} chương cần lưu ý`
              : 'Sẵn sàng nhập trực tiếp'}
          </span>
          {importProgress.total > 0 && (
            <AnimatedProgress
              value={(importProgress.current / importProgress.total) * 100}
              label={`Đã nhập ${importProgress.current.toLocaleString('vi-VN')}/${importProgress.total.toLocaleString('vi-VN')} chương`}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
        <button
          type="button"
          onClick={() => setCurrentStep(1)}
          className="flex-1 md:flex-initial px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200/80 text-stone-700 text-meta font-semibold transition-colors cursor-pointer"
        >
          Quay lại
        </button>
        <button
          type="button"
          disabled={isImporting || isReadingFile || selectedChapterIds.length === 0}
          onClick={handleConfirmImport}
          className="flex-1 md:flex-initial px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-on-primary text-meta font-semibold shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isImporting ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
              <span>
                Đang nhập ({importProgress.current.toLocaleString('vi-VN')}/{importProgress.total.toLocaleString('vi-VN')})...
              </span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[17px]" aria-hidden="true">file_download_done</span>
              <span>Xác nhận nhập {selectedChapterIds.length.toLocaleString('vi-VN')} chương</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  const storyBrainSection = (
    <>
      {job && (
        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-600 text-[20px]" aria-hidden="true">psychology</span>
              <span className="text-meta font-bold text-stone-900">
                Story Brain Job #{job.job_id.slice(0, 8)}
              </span>
            </div>
            <span
              className={`text-meta font-semibold px-2 py-0.5 rounded-full ${
                job.status === 'completed'
                  ? 'bg-emerald-50 text-emerald-700'
                  : job.status === 'failed'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-amber-50 text-amber-700'
              }`}
            >
              {jobStatusLabel(job.status)}
            </span>
          </div>

          <AnimatedProgress value={job.progress.total > 0 ? jobPercent : null} label="Tiến độ phân tích AI" />

          <span className="text-meta text-stone-500">
            {job.progress.current.toLocaleString('vi-VN')}/{job.progress.total.toLocaleString('vi-VN')} chương • Giai đoạn:{' '}
            <strong className="text-stone-700">{jobStageLabel(job.progress.stage)}</strong>
          </span>
          {job.error?.message && (
            <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 text-meta border border-rose-200">
              {jobErrorLabel(job.error.message)}
            </div>
          )}
          {job.status === 'failed' && (
            <button
              type="button"
              data-testid="import-retry"
              disabled={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
              className="self-start px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-meta font-semibold shadow-2xs cursor-pointer"
            >
              Thử lại từ chương còn dở
            </button>
          )}
        </div>
      )}

      {job?.status === 'waiting_entity_review' && (
        <div data-testid="import-chapter-review" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-meta text-amber-900 flex flex-col gap-2">
          <strong>
            Chương {(job.result?.awaiting_chapter ?? job.progress.current).toLocaleString('vi-VN')}/{job.progress.total.toLocaleString('vi-VN')} đang chờ bạn duyệt
          </strong>
          <span>
            Các chương được phân tích lần lượt để chương sau dùng đúng nhân vật và quy tắc bạn vừa duyệt.
            1) Xác nhận nhân vật của chương ngay bên dưới rồi bấm Tiếp tục. 2) Duyệt các đề xuất của chương ở hàng đợi.
            Khi xong cả hai, chương tiếp theo tự được phân tích.
          </span>
          {chapterReviewPending && (
            <div data-testid="import-entity-review" className="bg-surface-container-lowest border border-stone-200/80 rounded-lg p-2 text-stone-900">
              <EntityExtractionReview
                novelId={novelId}
                disabled={reviewAction.isPending}
                perform={(fn) => reviewAction.mutate(fn)}
                onContinued={() => queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] })}
              />
            </div>
          )}
          <button
            type="button"
            data-testid="import-next-chapter"
            disabled={chapterReviewPending || reviewGroups.length > 0 || nextChapterMutation.isPending}
            onClick={() => nextChapterMutation.mutate()}
            className="self-start px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-on-primary text-meta font-semibold shadow-2xs cursor-pointer"
          >
            Phân tích chương tiếp theo
          </button>
        </div>
      )}

      {job?.status === 'waiting_review' && finalReviewPending && (
        <div data-testid="import-final-chapter-review" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-meta text-amber-900 flex flex-col gap-2">
          <strong>Chương cuối đang chờ bạn xác nhận nhân vật</strong>
          <span>Xác nhận nhân vật bên dưới rồi bấm Tiếp tục, sau đó duyệt các đề xuất và kích hoạt Story Brain.</span>
          {(entityReviewsQuery.data ?? []).length > 0 && (
            <div data-testid="import-entity-review" className="bg-surface-container-lowest border border-stone-200/80 rounded-lg p-2 text-stone-900">
              <EntityExtractionReview
                novelId={novelId}
                disabled={reviewAction.isPending}
                perform={(fn) => reviewAction.mutate(fn)}
                onContinued={() => queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] })}
              />
            </div>
          )}
        </div>
      )}

      {(job?.status === 'waiting_review' || job?.status === 'waiting_entity_review') && (
        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600 text-[20px]" aria-hidden="true">rule</span>
              <h3 className="text-meta font-bold text-stone-900">
                Hàng đợi duyệt đề xuất Story Brain ({reviewGroups.length.toLocaleString('vi-VN')} nhóm)
              </h3>
            </div>
            {job.status === 'waiting_review' && (
              <button
                type="button"
                disabled={finalReviewPending || reviewGroups.length > 0 || activateMutation.isPending}
                onClick={() => activateMutation.mutate()}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-meta font-semibold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">verified</span>
                <span>Kích hoạt Story Brain Baseline</span>
              </button>
            )}
          </div>

          {reviewGroups.length === 0 ? (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-center text-meta text-emerald-800">
              {job.status === 'waiting_entity_review'
                ? 'Không còn đề xuất chờ duyệt. Nếu đã xác nhận nhân vật của chương này, hãy phân tích chương tiếp theo.'
                : finalReviewPending
                  ? 'Hãy xác nhận nhân vật của chương cuối ở phía trên; các đề xuất của chương sẽ hiện ở đây.'
                  : 'Tất cả các đề xuất đối chiếu đã được duyệt! Bạn có thể kích hoạt baseline ngay bây giờ.'}
            </div>
          ) : (
            <div className="space-y-3">
              {reviewGroups.map(([groupId, proposals]) => (
                <div
                  key={groupId}
                  className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/70 flex flex-col sm:flex-row justify-between items-start gap-3"
                >
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-meta font-bold">
                        Ưu tiên {Math.max(...proposals.map((p) => p.review_priority)).toLocaleString('vi-VN')}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 text-meta">
                        {proposals[0].review_reason}
                      </span>
                    </div>
                    <span className="text-meta font-semibold text-stone-900" data-testid="import-proposal-summary">
                      {summarizeProposalGroup(proposals)}
                    </span>
                    <ul className="text-meta text-stone-700 list-disc pl-5 space-y-0.5 max-h-72 overflow-y-auto">
                      {proposals.map((p) => (
                        <li key={p.proposal_id}>{describeProposal(p)}</li>
                      ))}
                    </ul>
                    <AnimatedDisclosure summary="Chi tiết kỹ thuật" className="text-meta text-stone-500">
                      <pre className="font-mono bg-surface-container-lowest p-2 rounded border border-stone-200 overflow-x-auto text-stone-700 mt-1.5">
                        {JSON.stringify(proposals.map((p) => p.payload), null, 2)}
                      </pre>
                    </AnimatedDisclosure>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                    <button
                      type="button"
                      onClick={() => acceptMutation.mutate({ groupId, proposals })}
                      className="px-2.5 py-1 rounded bg-primary-600 hover:bg-primary-700 text-on-primary text-meta font-semibold transition-colors cursor-pointer"
                    >
                      Chấp nhận
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectMutation.mutate(proposals)}
                      className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-meta font-medium border border-rose-200 transition-colors cursor-pointer"
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-surface font-body-md text-stone-800 antialiased selection:bg-primary-100 selection:text-primary-900 flex flex-col">
      <AuthorNavbar />

      {/* Always-mounted file input so both upload buttons and drag/drop work seamlessly */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.md,.json"
        className="hidden"
      />

      <main className="w-full flex-1 pt-0 pb-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-5 flex flex-col gap-5">
          {/* Breadcrumb */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Breadcrumbs
              items={[
                authorHomeCrumb,
                { label: novel?.title || 'Tác phẩm', to: navigationHref(`/author/novels/${novelId}`) },
                { label: 'Nhập bản thảo' }
              ]}
            />
          </div>

          {fileReadProgress !== null || isReadingFile ? (
            <AnimatedProgress
              value={fileReadProgress}
              label={isReadingFile ? 'Đang đọc tệp bản thảo' : 'Đã đọc tệp bản thảo'}
            />
          ) : null}

          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-stone-200">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-headline-sm text-page-title font-bold text-stone-900 tracking-tight">
                Nhập bản thảo
              </h1>
              <span className="sc-import-target inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-lowest border border-stone-200 text-stone-600 text-meta font-medium shadow-2xs">
                <span className="material-symbols-outlined text-body text-primary-600" aria-hidden="true">auto_stories</span>
                <span>Đã có {existingChapterCount.toLocaleString('vi-VN')} chương</span>
              </span>
            </div>
            {currentStep === 3 && (
              <button
                type="button"
                onClick={() => navigate(navigationHref(`/author/novels/${novelId}`))}
                className="px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-stone-200 hover:bg-stone-50 text-stone-700 text-meta font-semibold shadow-2xs transition-colors self-start md:self-auto"
              >
                Về trang tác phẩm
              </button>
            )}
          </div>

          {/* 3-Step Workflow Stepper */}
          <AnimatedStepper
            current={currentStep}
            onChange={handleStepSelect}
            steps={[
              {
                title: '1. Tải bản thảo',
                description: fileName || 'Chọn tệp .txt / .md hoặc dán văn bản',
                completed: parsedChapters.length > 0
              },
              {
                title: '2. Phân tích & Xem trước',
                description:
                  parsedChapters.length > 0
                    ? `${parsedChapters.length.toLocaleString('vi-VN')} chương phát hiện · ${
                        invalidChaptersCount > 0
                          ? `${invalidChaptersCount.toLocaleString('vi-VN')} cần xem`
                          : 'Sẵn sàng'
                      }`
                    : 'Kiểm tra danh sách chương tách tự động',
                completed: importProgress.total > 0 && importProgress.current === importProgress.total
              },
              {
                title: '3. Xác nhận & Story Brain',
                description: enableStoryBrainAi ? 'Lưu bản nháp & phân tích AI' : 'Lưu chương ở trạng thái bản nháp',
                completed: job?.status === 'completed' || (isImportCompleteSuccess && !enableStoryBrainAi)
              }
            ]}
          />

          {importSummary && (
            <section className="sc-import-result" aria-label="Kết quả nhập bản thảo" aria-live="polite">
              <strong>
                Kết quả nhập: {importSummary.completed.length.toLocaleString('vi-VN')}/{importSummary.total.toLocaleString('vi-VN')} chương hoàn tất
              </strong>
              {importSummary.failed && (
                <p>
                  Dừng tại: {importSummary.failed} · {importSummary.unattempted.toLocaleString('vi-VN')} chương chưa xử lý.
                </p>
              )}
              {importSummary.message && <p role="alert">{importSummary.message}</p>}
              {importSummary.message && (
                <p>
                  {importSummary.snapshotFailed ? 'Chương đã được tạo nhưng chưa hoàn tất snapshot. ' : ''}
                  Hãy kiểm tra danh sách chương trước khi nhập lại để tránh trùng nội dung.
                </p>
              )}
              {!!importSummary.completed.length && (
                <AnimatedDisclosure summary="Chương đã hoàn tất" className="text-meta mt-2">
                  <ul className="list-disc pl-5 mt-1 space-y-0.5">
                    {importSummary.completed.map((title, index) => (
                      <li key={index}>{title}</li>
                    ))}
                  </ul>
                </AnimatedDisclosure>
              )}
              <div className="mt-2">
                <Link className="sc-workspace-button" to={navigationHref(`/author/novels/${novelId}`)}>
                  Kiểm tra danh sách chương
                </Link>
              </div>
            </section>
          )}

          {showStep1Focused ? (
            /* ──────────────────────────────────────────
                STEP 1: Focused Upload & Paste Card
               ────────────────────────────────────────── */
            <div className="max-w-3xl mx-auto w-full flex flex-col gap-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleDropFile}
                className={`bg-surface-container-lowest rounded-xl p-6 sm:p-8 shadow-2xs border-2 border-dashed transition-colors flex flex-col items-center text-center gap-4 ${
                  isDraggingFile
                    ? 'border-primary-600 bg-primary-50/40'
                    : 'border-stone-300 hover:border-primary-600/60'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[24px]" aria-hidden="true">upload_file</span>
                </div>
                <div className="space-y-1 max-w-md">
                  <h2 className="text-section-title text-stone-900">
                    Kéo thả tệp bản thảo vào đây
                  </h2>
                  <p className="text-body text-stone-500">
                    Hỗ trợ tệp văn bản <strong className="text-stone-700">.txt</strong> hoặc <strong className="text-stone-700">.md</strong>. Hệ thống tự động tách chương theo số thứ tự nối tiếp từ chương {startingChapterNumber.toLocaleString('vi-VN')}.
                  </p>
                  {fileName && (
                    <p className="text-meta text-primary-700 font-semibold pt-1">
                      Đã nạp: {fileName} {fileSizeStr ? `(${fileSizeStr})` : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="sc-button sc-button-primary cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">file_upload</span>
                    <span>Chọn tệp từ máy</span>
                  </button>
                  <button
                    type="button"
                    onClick={openFullPasteModal}
                    className="sc-button cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">content_paste</span>
                    <span>Dán toàn bộ bản thảo</span>
                  </button>
                  {parsedChapters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="sc-button sc-button-soft cursor-pointer"
                    >
                      <span>Tiếp tục xem trước ({parsedChapters.length.toLocaleString('vi-VN')} chương) →</span>
                    </button>
                  )}
                </div>
              </div>

              {advancedSettingsDisclosure}
            </div>
          ) : currentStep === 3 && (importSummary || job) ? (
            /* ──────────────────────────────────────────
                STEP 3: Post-Import Summary & Story Brain Review
               ────────────────────────────────────────── */
            <div className="max-w-4xl mx-auto w-full flex flex-col gap-4">
              {storyBrainSection}
              {(!job || Boolean(importSummary?.message)) && importSummary && (
                <div className="bg-surface-container-lowest rounded-xl p-5 shadow-2xs border border-stone-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3 max-w-xl">
                    <span
                      className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${
                        isImportCompleteSuccess
                          ? 'text-emerald-700'
                          : isPartialImportFailure
                            ? 'text-amber-700'
                            : 'text-rose-700'
                      }`}
                      aria-hidden="true"
                    >
                      {isImportCompleteSuccess ? 'check_circle' : isPartialImportFailure ? 'warning' : 'error'}
                    </span>
                    <div className="space-y-1">
                      <h2 className="text-card-title text-stone-900">
                        {isImportCompleteSuccess
                          ? 'Đã lưu bản nháp vào tác phẩm'
                          : isPartialImportFailure
                            ? 'Nhập bản thảo mới hoàn tất một phần'
                            : 'Nhập bản thảo chưa hoàn tất'}
                      </h2>
                      <p className="text-body text-stone-500">
                        {isImportCompleteSuccess
                          ? 'Bạn có thể mở trang quản lý tác phẩm để kiểm tra và xuất bản từng chương.'
                          : isPartialImportFailure
                            ? `Đã lưu ${importedCount.toLocaleString('vi-VN')}/${importSummary.total.toLocaleString('vi-VN')} chương trước khi gặp lỗi. Quay lại bước 2 để kiểm tra và thử lại các chương còn lại.`
                            : importSummary.snapshotFailed
                              ? 'Chương đầu tiên đã được tạo nhưng chưa hoàn tất snapshot. Hãy kiểm tra danh sách chương hoặc quay lại bước 2 để thử lại.'
                              : 'Chưa có chương nào được lưu hoàn chỉnh. Quay lại bước 2 để kiểm tra lại danh sách chương và thử lại.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isImportCompleteSuccess ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRawText('');
                          setParsedChapters([]);
                          setSelectedChapterIds([]);
                          setImportSummary(null);
                          setFileName('');
                          setFileSizeStr('');
                          setCurrentStep(1);
                        }}
                        className="sc-button cursor-pointer"
                      >
                        Nhập thêm bản thảo
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        className="sc-button sc-button-primary cursor-pointer"
                      >
                        Quay lại bước 2 để thử lại
                      </button>
                    )}
                    <Link
                      to={navigationHref(`/author/novels/${novelId}`)}
                      className={isImportCompleteSuccess ? 'sc-button sc-button-primary' : 'sc-button'}
                    >
                      Mở trang tác phẩm
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ──────────────────────────────────────────
                STEP 2 (and pre-import Step 3): 2-Column Workspace
               ────────────────────────────────────────── */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* LEFT COLUMN: Upload Info & Regex Settings */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                {/* Selected File Card */}
                <div className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-meta text-stone-500 font-bold">
                      Tệp bản thảo
                    </span>
                    {rawText && (
                      <span className="inline-flex items-center gap-1 text-meta text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
                        Sẵn sàng tách
                      </span>
                    )}
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={handleDropFile}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isDraggingFile
                        ? 'bg-primary-50/40 border-primary-600'
                        : 'bg-stone-50 border-stone-100'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary-600/10 text-primary-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[22px]" aria-hidden="true">description</span>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-meta font-semibold text-stone-900 truncate" title={fileName}>
                        {fileName || 'Bản thảo văn bản'}
                      </span>
                      {fileSizeStr && (
                        <div className="flex items-center gap-1.5 text-meta text-stone-500 mt-0.5">
                          <span>{fileSizeStr}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-stone-100 hover:bg-stone-200/80 text-stone-800 text-meta font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]" aria-hidden="true">file_upload</span>
                      <span>Tải tệp khác</span>
                    </button>
                    <button
                      type="button"
                      onClick={openFullPasteModal}
                      className="py-1.5 px-3 rounded-lg bg-stone-100 hover:bg-stone-200/80 text-stone-800 text-meta font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      title="Dán hoặc sửa toàn bộ bản thảo"
                    >
                      <span className="material-symbols-outlined text-[15px]" aria-hidden="true">content_paste</span>
                      <span>Dán toàn bộ bản thảo</span>
                    </button>
                  </div>
                </div>

                {advancedSettingsDisclosure}
              </div>

              {/* RIGHT COLUMN: Table, Preview & Action Bar */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                {/* Summary Stats Header Bar */}
                <div className="bg-surface-container-lowest rounded-xl px-4 py-2.5 shadow-2xs border border-stone-200">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary-600 text-[18px]" aria-hidden="true">splitscreen</span>
                        <span className="text-meta font-bold text-stone-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <NumberFlow value={parsedChapters.length} locales="vi-VN" animated={!reduce} /> chương được phát hiện
                        </span>
                      </div>
                      <span className="text-stone-300 hidden sm:inline" aria-hidden="true">•</span>
                      <div className="flex items-center gap-1 text-stone-500 text-meta">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">notes</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <NumberFlow value={totalWords} locales="vi-VN" animated={!reduce} /> từ
                        </span>
                      </div>
                      <span className="text-stone-300 hidden sm:inline" aria-hidden="true">•</span>
                      <div className="flex items-center gap-1 text-stone-500 text-meta">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">forward</span>
                        <span>
                          Nối tiếp:{' '}
                          <strong className="text-stone-800 font-semibold">
                            {parsedChapters.length > 0
                              ? `Chương ${startingChapterNumber.toLocaleString('vi-VN')}–${(startingChapterNumber + parsedChapters.length - 1).toLocaleString('vi-VN')}`
                              : `Từ chương ${startingChapterNumber.toLocaleString('vi-VN')}`}
                          </strong>
                        </span>
                      </div>
                    </div>
                    {invalidChaptersCount > 0 ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-medium text-meta border border-amber-200">
                        <span className="material-symbols-outlined text-body text-amber-600" aria-hidden="true">warning</span>
                        <span>{invalidChaptersCount.toLocaleString('vi-VN')} cần kiểm tra (tiêu đề chưa rõ)</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-meta font-medium border border-emerald-200">
                        <span className="material-symbols-outlined text-body" aria-hidden="true">check_circle</span>
                        <span>Tất cả hợp lệ</span>
                      </div>
                    )}
                  </div>
                </div>

                {!!duplicateGroups.length && (
                  <section className="sc-duplicate-warning" aria-label="Chương trùng nội dung">
                    <strong>{duplicateGroups.length.toLocaleString('vi-VN')} nhóm chương có nội dung trùng nhau</strong>
                    <p className="text-meta">Chỉ so sánh các chương trong tệp đang nhập, bỏ qua khác biệt khoảng trắng.</p>
                    <div className="sc-workspace-row mt-1.5">
                      <button
                        type="button"
                        className="sc-workspace-button"
                        disabled={isImporting}
                        onClick={() => {
                          setOnlyDuplicates(true);
                          setOnlyInvalid(false);
                          setCurrentPage(1);
                        }}
                      >
                        Xem chương trùng
                      </button>
                      <button
                        type="button"
                        className="sc-workspace-button"
                        disabled={isImporting}
                        onClick={deselectDuplicateCopies}
                      >
                        Bỏ chọn bản trùng
                      </button>
                    </div>
                    <AnimatedDisclosure summary="Nhóm chương trùng" className="text-meta mt-2">
                      <ul className="list-disc pl-5 mt-1 space-y-0.5">
                        {duplicateGroups.map((group) => (
                          <li key={group[0]}>
                            {group.map((id) => parsedChapters.find((ch) => ch.id === id)?.title).join(' · ')}
                          </li>
                        ))}
                      </ul>
                    </AnimatedDisclosure>
                  </section>
                )}

                {/* Chapter Detection Table */}
                <div className="bg-surface-container-lowest rounded-xl shadow-2xs border border-stone-200 flex flex-col overflow-hidden">
                  {/* Table Control Bar */}
                  <div className="px-4 py-2 bg-stone-50/80 flex flex-wrap items-center justify-between gap-2.5 border-b border-stone-200">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <AnimatedCheckbox
                          aria-label="Chọn tất cả chương"
                          indeterminate={
                            selectedChapterIds.length > 0 && selectedChapterIds.length < parsedChapters.length
                          }
                          checked={
                            selectedChapterIds.length === parsedChapters.length && parsedChapters.length > 0
                          }
                          onChange={handleSelectAll}
                          className="shrink-0"
                        />
                        <span className="text-meta font-semibold text-stone-800">
                          Chọn tất cả ({selectedChapterIds.length.toLocaleString('vi-VN')} / {parsedChapters.length.toLocaleString('vi-VN')} chương)
                        </span>
                      </label>
                      <span className="text-stone-300" aria-hidden="true">•</span>
                      <span className="text-meta text-stone-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-body" aria-hidden="true">edit_note</span>
                        Nhấp vào ô tiêu đề để sửa nhanh
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <AnimatedCheckbox
                        size="xs"
                        label={`Chỉ chương cần sửa (${invalidChaptersCount.toLocaleString('vi-VN')})`}
                        checked={onlyInvalid}
                        disabled={isImporting}
                        onChange={(e) => {
                          setOnlyInvalid(e.currentTarget.checked);
                          setCurrentPage(1);
                        }}
                      />
                      <AnimatedCheckbox
                        size="xs"
                        label={`Chỉ chương trùng (${duplicateIds.size.toLocaleString('vi-VN')})`}
                        checked={onlyDuplicates}
                        disabled={isImporting}
                        onChange={(e) => {
                          setOnlyDuplicates(e.currentTarget.checked);
                          setCurrentPage(1);
                        }}
                      />
                      <button
                        type="button"
                        className="sc-workspace-button"
                        disabled={!invalidChaptersCount || isImporting}
                        onClick={nextInvalid}
                      >
                        Lỗi tiếp theo
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoRenumber}
                        className="px-2.5 py-1 rounded-lg bg-surface-container-lowest hover:bg-stone-100 text-stone-700 text-meta border border-stone-200 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <span className="material-symbols-outlined text-[15px]" aria-hidden="true">format_list_numbered</span>
                        <span>Đánh lại số thứ tự</span>
                      </button>
                    </div>
                  </div>

                  <SelectionToolbar count={selectedChapterIds.length} onClear={() => setSelectedChapterIds([])} />

                  {/* Table */}
                  <ResultsSurface
                    identity={`${onlyInvalid}:${onlyDuplicates}:${currentPage}:${parsedChapters.length}`}
                    busy={isReadingFile}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-left border-collapse">
                        <thead>
                          <tr className="bg-stone-100/70 text-meta text-stone-500 border-b border-stone-200 font-semibold">
                            <th className="py-2 px-3 w-10 text-center">Chọn</th>
                            <th className="py-2 px-2 w-12 text-center">Tệp</th>
                            <th className="py-2 px-2 w-16 text-center">Đích</th>
                            <th className="py-2 px-3">Tiêu đề chương (Chỉnh sửa trực tiếp)</th>
                            <th className="py-2 px-3 w-24 text-right">Số từ</th>
                            <th className="py-2 px-3 w-28 text-center">Trạng thái</th>
                            <th className="py-2 px-3 w-24 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="text-meta text-stone-800 divide-y divide-stone-100">
                          {paginatedChapters.map((ch) => {
                            const isSelected = selectedChapterIds.includes(ch.id);
                            const isCurrentPreview = activePreviewChapter?.id === ch.id;

                            return (
                              <tr
                                key={ch.id}
                                className={`transition-colors ${
                                  isCurrentPreview
                                    ? 'bg-primary-50/60'
                                    : isSelected
                                      ? 'hover:bg-stone-50/70'
                                      : 'opacity-60 hover:opacity-100 hover:bg-stone-50/50'
                                }`}
                              >
                                <td className="py-2 px-3 text-center">
                                  <AnimatedCheckbox
                                    aria-label={`Chọn chương ${ch.targetNumber}`}
                                    checked={isSelected}
                                    onChange={() => handleSelectOne(ch.id)}
                                    className="shrink-0"
                                  />
                                </td>
                                <td className="py-2 px-2 text-center font-mono text-stone-400 text-meta">
                                  #{String(ch.sourceIndex).padStart(2, '0')}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <span className="px-1.5 py-0.5 rounded bg-primary-600/10 text-primary-700 font-semibold text-meta">
                                    C. {ch.targetNumber.toLocaleString('vi-VN')}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="relative group">
                                    <input
                                      type="text"
                                      data-chapter-title={ch.id}
                                      aria-label={`Tiêu đề chương ${ch.targetNumber}`}
                                      value={ch.title}
                                      onChange={(e) => handleUpdateTitle(ch.id, e.target.value)}
                                      className={`w-full px-2 py-1 rounded text-meta transition-colors focus:outline-none focus:ring-1 focus:ring-primary-600 ${
                                        !ch.isValid
                                          ? 'bg-amber-50/80 border border-amber-300 text-amber-900 font-semibold'
                                          : 'bg-transparent hover:bg-surface-container-lowest focus:bg-surface-container-lowest border border-transparent hover:border-stone-200 focus:border-primary-600'
                                      }`}
                                    />
                                    {!ch.isValid && (
                                      <span className="absolute right-2 top-1.5 material-symbols-outlined text-[15px] text-amber-600 pointer-events-none" aria-hidden="true">
                                        warning
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-stone-600 text-meta tabular-nums">
                                  {ch.wordCount.toLocaleString('vi-VN')} từ
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {ch.isValid ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-meta font-semibold border border-emerald-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
                                      Hợp lệ
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-meta font-semibold border border-amber-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
                                      {ch.validationMessage || 'Chưa rõ tên'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {isCurrentPreview ? (
                                    <span className="inline-flex items-center gap-1 text-meta text-primary-600 font-bold">
                                      <span className="material-symbols-outlined text-body" aria-hidden="true">visibility</span>
                                      Đang xem
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewChapterId(ch.id)}
                                      className="text-stone-500 hover:text-primary-600 text-meta font-medium transition-colors cursor-pointer"
                                    >
                                      Xem thử
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {visibleChapters.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-stone-500 text-meta">
                                {onlyDuplicates
                                  ? 'Không có chương trùng phù hợp với bộ lọc.'
                                  : onlyInvalid
                                    ? 'Không có chương cần sửa.'
                                    : 'Chưa tìm thấy chương nào theo quy tắc hiện tại. Hãy kiểm tra lại regex hoặc dán nội dung.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </ResultsSurface>

                  {/* Pagination */}
                  <div className="p-2.5 px-4 bg-stone-50/80 flex items-center justify-between text-meta text-stone-500 border-t border-stone-200">
                    <span>
                      Hiển thị {paginatedChapters.length.toLocaleString('vi-VN')} / {visibleChapters.length.toLocaleString('vi-VN')} chương{onlyInvalid ? ' cần sửa' : ' phát hiện'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Trang trước"
                        title="Trang trước"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1 rounded text-stone-700 hover:bg-stone-200 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
                      </button>
                      <span className="px-2 py-0.5 rounded bg-surface-container-lowest border border-stone-200 font-semibold text-stone-700 tabular-nums">
                        Trang {currentPage.toLocaleString('vi-VN')} / {totalPages.toLocaleString('vi-VN')}
                      </span>
                      <button
                        type="button"
                        aria-label="Trang sau"
                        title="Trang sau"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1 rounded text-stone-700 hover:bg-stone-200 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Realistic Preview Article Card */}
                {activePreviewChapter && (
                  <div className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary-600" aria-hidden="true"></span>
                        <span className="text-meta text-stone-500 font-bold">
                          Trích đoạn xem trước thực tế
                        </span>
                        <span className="px-2 py-0.5 rounded bg-stone-100 text-primary-600 text-meta font-semibold">
                          {activePreviewChapter.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-stone-400 text-meta">
                        <span className="material-symbols-outlined text-[15px]" aria-hidden="true">visibility</span>
                        <span className="text-meta">Xem trước 4 đoạn đầu</span>
                      </div>
                    </div>

                    <article className="p-5 bg-surface-subtle rounded-lg border border-stone-100 flex flex-col gap-3 max-w-[760px] mx-auto w-full font-serif">
                      <header className="text-center pb-2">
                        <span className="text-meta text-stone-500 font-sans">
                          Chương đích: C. {activePreviewChapter.targetNumber.toLocaleString('vi-VN')}
                        </span>
                        <h3 className="text-lg font-bold text-stone-900 mt-1">
                          {activePreviewChapter.title}
                        </h3>
                        <div className="w-10 h-0.5 bg-primary-600/30 mx-auto mt-2" aria-hidden="true"></div>
                      </header>

                      <div className="text-[15px] text-stone-800 space-y-3 leading-relaxed">
                        {activePreviewChapter.content ? (
                          activePreviewChapter.content
                            .split(/\n\s*\n/)
                            .slice(0, 4)
                            .map((para, i) => (
                              <p key={i} className="indent-6">
                                {para}
                              </p>
                            ))
                        ) : (
                          <p className="text-stone-400 italic text-center py-4">
                            (Nội dung chương này đang trống)
                          </p>
                        )}
                      </div>
                    </article>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-stone-500 text-meta pt-1">
                      <span>
                        Đang xem trích đoạn đầu của{' '}
                        <strong className="text-stone-700">{activePreviewChapter.title}</strong> (
                        {activePreviewChapter.wordCount.toLocaleString('vi-VN')} từ)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingChapterId(activePreviewChapter.id);
                          setTempPasteText(activePreviewChapter.content);
                          setPasteModalOpen(true);
                        }}
                        className="text-primary-600 hover:underline font-medium cursor-pointer"
                      >
                        Sửa nội dung chương này →
                      </button>
                    </div>
                  </div>
                )}

                {actionConfirmationBar}
                {storyBrainSection}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ──────────────────────────────────────────
          Direct Text Paste / Single-Chapter Edit Modal
         ────────────────────────────────────────── */}
      <AnimatedModal
        opened={pasteModalOpen}
        onClose={closePasteModal}
        title={editingChapterId ? 'Sửa nội dung chương' : 'Dán hoặc chỉnh sửa văn bản bản thảo'}
        size="lg"
        centered
      >
        <div className="flex flex-col gap-4">
          <p className="text-meta text-stone-500">
            {editingChapterId
              ? 'Chỉnh sửa nội dung riêng của chương đang chọn. Các chương khác trong bản thảo được giữ nguyên.'
              : 'Dán toàn bộ nội dung bản thảo hoặc các chương tại đây. Bộ phân tích sẽ tự động tách chương theo quy tắc nhận diện.'}
          </p>
          <textarea
            rows={12}
            aria-label={editingChapterId ? 'Nội dung chương' : 'Nội dung bản thảo'}
            value={tempPasteText}
            onChange={(e) => setTempPasteText(e.target.value)}
            placeholder={
              editingChapterId
                ? 'Nhập hoặc chỉnh sửa nội dung của chương này...'
                : 'Dán nội dung bản thảo tại đây... (Ví dụ: Chương 1: ..., Chương 2: ...)'
            }
            className="w-full bg-stone-50 border border-stone-200 rounded-lg p-3 font-mono text-meta text-stone-800 focus:outline-none focus:bg-surface-container-lowest focus:border-primary-600 focus:ring-1 focus:ring-primary-600"
          />
          <div className="flex items-center justify-between pt-2 border-t border-stone-100">
            <span className="text-meta text-stone-400 tabular-nums">
              {tempPasteText.length.toLocaleString('vi-VN')} ký tự
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closePasteModal}
                className="px-3.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-meta font-medium cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSavePasteModal}
                className="px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-on-primary text-meta font-semibold cursor-pointer shadow-2xs"
              >
                {editingChapterId ? 'Lưu nội dung chương' : 'Áp dụng & Phân tích'}
              </button>
            </div>
          </div>
        </div>
      </AnimatedModal>
    </div>
  );
}
