import { AuthorDialog, AuthorNavbar } from '../../shared/components/AuthorTheme';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { getNovel, listChapters } from '../novels/novel-api';
import {
  acceptProposalGroup,
  activateBaseline,
  getBootstrapJob,
  getReviewQueue,
  getStoryBrainSummary,
  rejectProposal,
  startManuscriptBootstrap,
  parseManuscriptChapters,
  normalizeManuscriptText,
  importChaptersBatch,
  type ParsedChapterItem,
  type ReviewProposal
} from './manuscript-import-api';

export function ManuscriptImportPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
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

  // Stepper state (1: Upload, 2: Analyze & Preview, 3: Confirm Import)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // File state
  const [fileName, setFileName] = useState('');
  const [fileSizeStr, setFileSizeStr] = useState('');
  const [rawText, setRawText] = useState('');
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [tempPasteText, setTempPasteText] = useState('');

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
  const pageSize = 6;

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Import Execution State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Story Brain Job & Review State
  const [jobId, setJobId] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ['manuscript-bootstrap-job', jobId],
    queryFn: () => getBootstrapJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.status ?? '') ? 1000 : false
  });

  const reviewQuery = useQuery({
    queryKey: ['manuscript-review-queue', novelId],
    queryFn: () => getReviewQueue(novelId),
    enabled: Boolean(novelId && (jobQuery.data?.status === 'waiting_review' || currentStep === 3))
  });

  const brainQuery = useQuery({
    queryKey: ['story-brain-summary', novelId],
    queryFn: () => getStoryBrainSummary(novelId),
    enabled: Boolean(novelId)
  });

  // Re-parse when text, regex, or normalizations change
  useEffect(() => {
    const normalized = normalizeManuscriptText(rawText, {
      normalizePunctuation,
      removeExtraBlankLines,
      preserveDialogue
    });
    const parsed = parseManuscriptChapters(normalized, appliedRegex, startingChapterNumber);
    setParsedChapters(parsed);
    setSelectedChapterIds(parsed.map((c) => c.id));
    if (parsed.length > 0 && !previewChapterId) {
      setPreviewChapterId(parsed[0].id);
    }
  }, [
    rawText,
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

  // Paginated chapters for the table
  const totalPages = Math.ceil(parsedChapters.length / pageSize) || 1;
  const paginatedChapters = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return parsedChapters.slice(start, start + pageSize);
  }, [parsedChapters, currentPage, pageSize]);

  // Active preview chapter
  const activePreviewChapter = useMemo(() => {
    return parsedChapters.find((c) => c.id === previewChapterId) || parsedChapters[0] || null;
  }, [parsedChapters, previewChapterId]);

  // Handle select all
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
          validationMessage: !meaningful ? 'Thiếu tiêu đề chương' : undefined
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
        // If title already has "Chương X: Y", replace the number
        const replaced = currentTitle.replace(
          /^(Chương|Hồi|Chapter|Phần)\s+\d+[:\s\.\-—]*/i,
          `Chương ${destNum}: `
        );
        const finalTitle = replaced === currentTitle ? `Chương ${destNum}: ${currentTitle}` : replaced;
        return {
          ...c,
          targetNumber: destNum,
          title: finalTitle,
          isValid: true,
          validationMessage: undefined
        };
      })
    );
    showToast('Đã tự động đánh lại số thứ tự nối tiếp!');
  };

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const sizeKb = Math.round(file.size / 1024);
    setFileSizeStr(sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setRawText(content);
        setCurrentStep(2);
        showToast(`Đã tải lên "${file.name}" và phân tích ${content.length} ký tự!`);
      }
    };
    reader.onerror = () => {
      showToast('Lỗi khi đọc tệp. Vui lòng thử lại với tệp định dạng .txt, .md hoặc .json');
    };
    reader.readAsText(file);
  };

  // Mutations: Story Brain Bootstrap & Review
  const startBootstrapMutation = useMutation({
    mutationFn: async (revisions: any[]) => {
      return startManuscriptBootstrap(novelId, revisions);
    },
    onSuccess: (result) => {
      setJobId(result.job_id);
      showToast('Đã bắt đầu phân tích Story Brain AI! Đang tiến hành quét các chương...');
    },
    onError: (err: any) => {
      showToast('Lỗi Story Brain: ' + (err?.message || 'Không thể bắt đầu phân tích AI'));
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
    onError: (err: any) => showToast('Lỗi duyệt đề xuất: ' + (err?.message || 'Thất bại'))
  });

  const rejectMutation = useMutation({
    mutationFn: (proposals: ReviewProposal[]) =>
      Promise.all(proposals.map((item) => rejectProposal(item.proposal_id))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['manuscript-review-queue', novelId] });
      showToast('Đã từ chối đề xuất AI.');
    }
  });

  const activateMutation = useMutation({
    mutationFn: () => activateBaseline(novelId, jobId!),
    onSuccess: () => {
      showToast('Đã kích hoạt Story Brain baseline thành công! Sẵn sàng trong Studio.');
      queryClient.invalidateQueries({ queryKey: ['story-brain-summary', novelId] });
    },
    onError: (err: any) => showToast('Lỗi kích hoạt baseline: ' + (err?.message || 'Thất bại'))
  });

  // Main Action: Confirm Import Chapters to Novel
  const handleConfirmImport = async () => {
    const toImport = parsedChapters.filter((c) => selectedChapterIds.includes(c.id));
    if (toImport.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 chương để nhập!');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: toImport.length });

    try {
      // 1. Batch create chapters in Novel DB
      const createdChapters = await importChaptersBatch(
        novelId,
        toImport.map((c) => ({
          title: c.title.trim(),
          content: c.content,
          isVip: false,
          priceCoins: 0
        })),
        (curr, tot) => setImportProgress({ current: curr, total: tot })
      );

      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
      showToast(`Đã nhập thành công ${createdChapters.length} chương vào tác phẩm!`);

      // 2. If Story Brain AI enabled, trigger AI bootstrap with revision data
      if (enableStoryBrainAi && createdChapters.length > 0) {
        const revisions = createdChapters.map((ch: any) => ({
          chapter_id: ch.chapterId,
          revision_id: ch.chapterId,
          content_hash: 'auto-sha256'
        }));
        try {
          await startBootstrapMutation.mutateAsync(revisions);
        } catch {
          // Handled in mutation onError
        }
      }

      setCurrentStep(3);
    } catch (err: any) {
      showToast('Lỗi nhập chương: ' + (err?.message || 'Không thể nhập toàn bộ chương'));
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

  const job = jobQuery.data;
  const jobPercent = job?.progress?.total
    ? Math.round((job.progress.current / job.progress.total) * 100)
    : 0;

  const novel = novelQuery.data;

  if (novelQuery.isLoading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-body font-medium text-stone-500">Đang tải thông tin tác phẩm...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface font-body-md text-stone-800 antialiased selection:bg-primary-100 selection:text-primary-900 flex flex-col">
      {/* ──────────────────────────────────────────
          1. Fixed Top Header Navigation Bar
         ────────────────────────────────────────── */}
      <AuthorNavbar />

      {/* ──────────────────────────────────────────
          Main Content Container
         ────────────────────────────────────────── */}
      <main className="w-full flex-1 pt-0 pb-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-5 flex flex-col gap-5">
          {/* Breadcrumb & Back Link */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-meta text-stone-500 flex-wrap"
            >
              <Link to="/author" className="hover:text-primary-600 transition-colors">
                Bảng làm việc
              </Link>
              <span className="material-symbols-outlined text-[15px] text-stone-400">chevron_right</span>
              <Link to="/author" className="hover:text-primary-600 transition-colors">
                Tác phẩm của tôi
              </Link>
              <span className="material-symbols-outlined text-[15px] text-stone-400">chevron_right</span>
              <Link
                to={`/author/novels/${novelId}`}
                className="hover:text-primary-600 transition-colors font-medium text-stone-700"
              >
                {novel?.title || 'Tác phẩm'}
              </Link>
              <span className="material-symbols-outlined text-[15px] text-stone-400">chevron_right</span>
              <span className="text-primary-600 font-semibold">Nhập bản thảo</span>
            </nav>
            <Link
              to={`/author/novels/${novelId}`}
              className="inline-flex items-center gap-1.5 text-meta text-primary-600 hover:text-primary-700 transition-colors group font-medium"
            >
              <span className="material-symbols-outlined text-[16px] group-hover:-translate-x-0.5 transition-transform">
                arrow_back
              </span>
              <span>Quay lại Quản lý tác phẩm</span>
            </Link>
          </div>

          {/* Target Novel Identifier & Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-stone-200">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="font-headline-sm text-2xl font-bold text-stone-900 tracking-tight">
                  Nhập bản thảo
                </h1>
                <span title={novel?.title} className="sc-import-target inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-stone-200 text-primary-600 text-meta font-medium shadow-2xs">
                  <span className="material-symbols-outlined text-body">auto_stories</span>
                  <span>
                    Tác phẩm đích: <strong className="font-semibold text-stone-800">{novel?.title}</strong>{' '}
                    • (Đã có {existingChapterCount} chương)
                  </span>
                </span>
              </div>
            </div>
            {currentStep === 3 && (
              <button
                onClick={() => navigate(`/author/novels/${novelId}`)}
                className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-meta font-semibold shadow-2xs transition-colors self-start md:self-auto"
              >
                Về trang tác phẩm
              </button>
            )}
          </div>

          {/* 3-Step Workflow Stepper */}
          <div className="w-full bg-white rounded-xl p-2 shadow-2xs border border-stone-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {/* Step 1 */}
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                  currentStep === 1
                    ? 'bg-primary-600 text-white shadow-2xs'
                    : 'bg-stone-50/70 hover:bg-stone-100 text-stone-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-meta font-bold shrink-0 ${
                    currentStep === 1
                      ? 'bg-white/20 text-white'
                      : 'bg-primary-600/10 text-primary-600'
                  }`}
                >
                  {parsedChapters.length > 0 ? (
                    <span className="material-symbols-outlined text-body">check</span>
                  ) : (
                    '1'
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-meta font-semibold truncate">1. Tải bản thảo</span>
                  <span
                    className={`text-meta truncate ${
                      currentStep === 1 ? 'text-white/80' : 'text-stone-500'
                    }`}
                  >
                    {fileName}
                  </span>
                </div>
              </button>

              {/* Step 2 */}
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                  currentStep === 2
                    ? 'bg-primary-600 text-white shadow-2xs'
                    : 'bg-stone-50/70 hover:bg-stone-100 text-stone-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-meta font-bold shrink-0 ${
                    currentStep === 2
                      ? 'bg-white/20 text-white'
                      : 'bg-stone-200 text-stone-700'
                  }`}
                >
                  2
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-meta font-semibold truncate">2. Phân tích &amp; Xem trước</span>
                  <span
                    className={`text-meta truncate ${
                      currentStep === 2 ? 'text-white/80' : 'text-stone-500'
                    }`}
                  >
                    {parsedChapters.length} chương phát hiện •{' '}
                    {invalidChaptersCount > 0 ? `${invalidChaptersCount} cần xem` : 'Sẵn sàng'}
                  </span>
                </div>
              </button>

              {/* Step 3 */}
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                  currentStep === 3
                    ? 'bg-primary-600 text-white shadow-2xs'
                    : 'bg-stone-50/70 hover:bg-stone-100 text-stone-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-meta font-bold shrink-0 ${
                    currentStep === 3
                      ? 'bg-white/20 text-white'
                      : 'bg-stone-200 text-stone-700'
                  }`}
                >
                  3
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-meta font-semibold truncate">3. Xác nhận &amp; Story Brain</span>
                  <span
                    className={`text-meta truncate ${
                      currentStep === 3 ? 'text-white/80' : 'text-stone-500'
                    }`}
                  >
                    Lưu bản nháp &amp; Huấn luyện AI
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Main 2-Column Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ──────────────────────────────────────────
                LEFT COLUMN: Upload Info & Regex Settings
               ────────────────────────────────────────── */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {/* Selected File Card */}
              <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-meta uppercase tracking-wider text-stone-500 font-bold">
                    Tệp bản thảo
                  </span>
                  {rawText && <span className="inline-flex items-center gap-1 text-meta text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Sẵn sàng tách
                  </span>}
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-stone-50 border border-stone-100">
                  <div className="w-10 h-10 rounded-lg bg-primary-600/10 text-primary-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px]">description</span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className="text-meta font-semibold text-stone-900 truncate"
                      title={fileName}
                    >
                      {fileName || 'Chưa chọn tệp hoặc dán bản thảo'}
                    </span>
                    <div className="flex items-center gap-1.5 text-meta text-stone-500 mt-0.5">
                      {fileSizeStr && <span>{fileSizeStr}</span>}
                    </div>
                  </div>
                </div>

                {/* Upload Buttons */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".txt,.md,.json"
                  className="hidden"
                />
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-stone-100 hover:bg-stone-200/80 text-stone-800 text-meta font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">file_upload</span>
                    <span>Tải tệp khác</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempPasteText(rawText);
                      setPasteModalOpen(true);
                    }}
                    className="py-1.5 px-3 rounded-lg bg-stone-100 hover:bg-stone-200/80 text-stone-800 text-meta font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    title="Dán hoặc sửa trực tiếp văn bản"
                  >
                    <span className="material-symbols-outlined text-[15px]">content_paste</span>
                    <span>Dán chữ</span>
                  </button>
                </div>
              </div>

              {/* Regex & Splitting Config Card */}
              <details className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200"><summary className="cursor-pointer text-body font-semibold text-stone-800">Cấu hình nâng cao</summary><div className="flex flex-col gap-4 mt-4">
                <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary-600 text-[18px]">tune</span>
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
                    <label className="text-meta font-semibold text-stone-700">
                      Quy tắc nhận diện (Regex)
                    </label>
                    <span className="text-stone-500 text-meta font-medium">
                      Khớp {parsedChapters.length} vị trí
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      spellCheck={false}
                      value={regexInput}
                      onChange={(e) => setRegexInput(e.target.value)}
                      className="flex-1 bg-stone-50 text-stone-900 font-mono text-meta rounded-lg px-2.5 py-1.5 border border-stone-200 focus:outline-none focus:bg-white focus:border-primary-600 focus:ring-1 focus:ring-primary-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedRegex(regexInput);
                        showToast(`Đã áp dụng quy tắc tách: ${regexInput}`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-meta font-semibold shadow-2xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-body">play_arrow</span>
                      <span>Áp dụng</span>
                    </button>
                  </div>
                </div>

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
                            ? 'bg-primary-600 text-white border-primary-600 font-semibold'
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
                  <span className="text-meta uppercase tracking-wider text-stone-500 font-bold">
                    Chuẩn hóa văn bản đầu vào
                  </span>
                  <label className="flex items-start gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={normalizePunctuation}
                      onChange={(e) => setNormalizePunctuation(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 rounded text-primary-600 border-stone-300 focus:ring-0 cursor-pointer"
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
                    <input
                      type="checkbox"
                      checked={removeExtraBlankLines}
                      onChange={(e) => setRemoveExtraBlankLines(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 rounded text-primary-600 border-stone-300 focus:ring-0 cursor-pointer"
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
                    <input
                      type="checkbox"
                      checked={preserveDialogue}
                      onChange={(e) => setPreserveDialogue(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 rounded text-primary-600 border-stone-300 focus:ring-0 cursor-pointer"
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

                {/* AI Story Brain Toggle */}
                <div className="pt-2 border-t border-stone-100 flex flex-col gap-1.5">
                  <label className="flex items-start gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={enableStoryBrainAi}
                      onChange={(e) => setEnableStoryBrainAi(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 rounded text-primary-600 border-stone-300 focus:ring-0 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-meta text-stone-800 group-hover:text-primary-600 font-semibold transition-colors flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px] text-primary-600">psychology</span>
                        Kích hoạt Story Brain AI
                      </span>
                      <span className="text-meta text-stone-500">
                        Tự động trích xuất thực thể, bối cảnh thế giới và tạo hàng đợi đối chiếu AI.
                      </span>
                    </div>
                  </label>
                </div>
              </div></details>
            </div>

            {/* ──────────────────────────────────────────
                RIGHT COLUMN: Table, Preview & Action Bar
               ────────────────────────────────────────── */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              {/* Summary Stats Header Bar */}
              <div className="bg-white rounded-xl px-4 py-2.5 shadow-2xs border border-stone-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary-600 text-[18px]">splitscreen</span>
                      <span className="text-meta font-bold text-stone-900">
                        {parsedChapters.length} chương được phát hiện
                      </span>
                    </div>
                    <span className="text-stone-300 hidden sm:inline">•</span>
                    <div className="flex items-center gap-1 text-stone-500 text-meta">
                      <span className="material-symbols-outlined text-[16px]">notes</span>
                      <span>
                        {totalWords.toLocaleString()} từ
                      </span>
                    </div>
                    <span className="text-stone-300 hidden sm:inline">•</span>
                    <div className="flex items-center gap-1 text-stone-500 text-meta">
                      <span className="material-symbols-outlined text-[16px]">forward</span>
                      <span>
                        Nối tiếp:{' '}
                        <strong className="text-stone-800 font-semibold">
                          {parsedChapters.length > 0 ? `Chương ${startingChapterNumber}–${startingChapterNumber + parsedChapters.length - 1}` : `Từ chương ${startingChapterNumber}`}
                        </strong>
                      </span>
                    </div>
                  </div>
                  {invalidChaptersCount > 0 ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-medium text-meta border border-amber-200">
                      <span className="material-symbols-outlined text-body text-amber-600">warning</span>
                      <span>{invalidChaptersCount} cần kiểm tra (tiêu đề chưa rõ)</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-meta font-medium border border-emerald-200">
                      <span className="material-symbols-outlined text-body">check_circle</span>
                      <span>Tất cả hợp lệ</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Chapter Detection Table */}
              <div className="bg-white rounded-xl shadow-2xs border border-stone-200 flex flex-col overflow-hidden">
                {/* Table Control Bar */}
                <div className="px-4 py-2 bg-stone-50/80 flex flex-wrap items-center justify-between gap-2.5 border-b border-stone-200">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={
                          selectedChapterIds.length === parsedChapters.length &&
                          parsedChapters.length > 0
                        }
                        onChange={handleSelectAll}
                        className="w-3.5 h-3.5 rounded text-primary-600 border-stone-300 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-meta font-semibold text-stone-800">
                        Chọn tất cả ({selectedChapterIds.length} / {parsedChapters.length} chương)
                      </span>
                    </label>
                    <span className="text-stone-300">•</span>
                    <span className="text-meta text-stone-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-body">edit_note</span>
                      Nhấp vào ô tiêu đề để sửa nhanh
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleAutoRenumber}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 text-stone-700 text-meta border border-stone-200 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <span className="material-symbols-outlined text-[15px]">format_list_numbered</span>
                      <span>Đánh lại số thứ tự</span>
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-100/70 text-meta text-stone-500 uppercase tracking-wider border-b border-stone-200 font-semibold">
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
                      {paginatedChapters.map((ch, idx) => {
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
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectOne(ch.id)}
                                className="w-3.5 h-3.5 rounded text-primary-600 border-stone-300 focus:ring-0 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-2 text-center font-mono text-stone-400 text-meta">
                              #{String(ch.sourceIndex).padStart(2, '0')}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className="px-1.5 py-0.5 rounded bg-primary-600/10 text-primary-700 font-semibold text-meta">
                                C. {ch.targetNumber}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="relative group">
                                <input
                                  type="text"
                                  value={ch.title}
                                  onChange={(e) => handleUpdateTitle(ch.id, e.target.value)}
                                  className={`w-full px-2 py-1 rounded text-meta transition-colors focus:outline-none focus:ring-1 focus:ring-primary-600 ${
                                    !ch.isValid
                                      ? 'bg-amber-50/80 border border-amber-300 text-amber-900 font-semibold'
                                      : 'bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-stone-200 focus:border-primary-600'
                                  }`}
                                />
                                {!ch.isValid && (
                                  <span className="absolute right-2 top-1.5 material-symbols-outlined text-[15px] text-amber-600 pointer-events-none">
                                    warning
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-stone-600 text-meta">
                              {ch.wordCount.toLocaleString()} từ
                            </td>
                            <td className="py-2 px-3 text-center">
                              {ch.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-meta font-semibold border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Hợp lệ
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-meta font-semibold border border-amber-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  {ch.validationMessage || 'Chưa rõ tên'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {isCurrentPreview ? (
                                <span className="inline-flex items-center gap-1 text-meta text-primary-600 font-bold">
                                  <span className="material-symbols-outlined text-body">visibility</span>
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
                      {parsedChapters.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-stone-500 text-meta">
                            Chưa tìm thấy chương nào theo quy tắc hiện tại. Hãy kiểm tra lại regex hoặc dán nội dung.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="p-2.5 px-4 bg-stone-50/80 flex items-center justify-between text-meta text-stone-500 border-t border-stone-200">
                  <span>
                    Hiển thị {paginatedChapters.length} / {parsedChapters.length} chương phát hiện
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                      title="Trang trước"
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                    </button>
                    <span className="px-2 py-0.5 rounded bg-white border border-stone-200 font-semibold text-stone-700">
                      Trang {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1 rounded hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                      title="Trang sau"
                    >
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Realistic Preview Article Card */}
              {activePreviewChapter && (
                <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary-600"></span>
                      <span className="text-meta uppercase tracking-wider text-stone-500 font-bold">
                        Trích đoạn xem trước thực tế
                      </span>
                      <span className="px-2 py-0.5 rounded bg-stone-100 text-primary-600 text-meta font-semibold">
                        {activePreviewChapter.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-stone-400 text-meta">
                      <span className="material-symbols-outlined text-[15px]">text_format</span>
                      <span className="text-meta">Phông chữ Merriweather (16px)</span>
                    </div>
                  </div>

                  <article className="p-5 bg-surface-subtle rounded-lg border border-stone-100 flex flex-col gap-3 max-w-[760px] mx-auto w-full font-serif">
                    <header className="text-center pb-2">
                      <span className="text-meta tracking-widest text-stone-400 uppercase font-sans">
                        Chương đích: C. {activePreviewChapter.targetNumber}
                      </span>
                      <h3 className="text-lg font-bold text-stone-900 mt-1">
                        {activePreviewChapter.title}
                      </h3>
                      <div className="w-10 h-0.5 bg-primary-600/30 mx-auto mt-2"></div>
                    </header>

                    <div className="text-[15px] text-stone-800 space-y-3 text-justify leading-relaxed">
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

                  <div className="flex items-center justify-between text-stone-500 text-meta pt-1">
                    <span>
                      Đang xem trích đoạn đầu của{' '}
                      <strong className="text-stone-700">{activePreviewChapter.title}</strong> (
                      {activePreviewChapter.wordCount.toLocaleString()} từ)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
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

              {/* Action / Confirmation Bar */}
              <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-start gap-3 max-w-xl">
                  <span className="material-symbols-outlined text-primary-600 text-[20px] shrink-0 mt-0.5">
                    info
                  </span>
                  <div className="flex flex-col">
                    <p className="text-meta text-stone-600 leading-relaxed">
                      Các chương sau khi nhập sẽ được lưu ở trạng thái{' '}
                      <strong className="text-stone-900">Bản nháp (Draft)</strong> trong tác phẩm{' '}
                      <strong>{novel?.title}</strong>. Tác phẩm của bạn hoàn toàn an toàn và không tự động xuất bản.
                    </p>
                    <span className="text-meta text-primary-600 font-semibold mt-0.5">
                      Đã chọn {selectedChapterIds.length} chương •{' '}
                      {invalidChaptersCount > 0
                        ? `${invalidChaptersCount} chương cần lưu ý`
                        : 'Sẵn sàng nhập trực tiếp'}
                    </span>
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
                    disabled={isImporting || selectedChapterIds.length === 0}
                    onClick={handleConfirmImport}
                    className="flex-1 md:flex-initial px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-meta font-semibold shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isImporting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>
                          Đang nhập ({importProgress.current}/{importProgress.total})...
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[17px]">file_download_done</span>
                        <span>Xác nhận nhập {selectedChapterIds.length} chương</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* ──────────────────────────────────────────
                  Story Brain AI Review & Baseline (Step 3 or Job Running)
                 ────────────────────────────────────────── */}
              {job && (
                <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary-600 text-[20px]">psychology</span>
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
                      {job.status}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-primary-600 h-full transition-all duration-300"
                      style={{ width: `${jobPercent}%` }}
                    ></div>
                  </div>

                  <span className="text-meta text-stone-500">
                    {job.progress.current}/{job.progress.total} chương • Giai đoạn:{' '}
                    <strong className="text-stone-700">{job.progress.stage}</strong>
                  </span>
                  {job.error?.message && (
                    <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 text-meta border border-rose-200">
                      {job.error.message}
                    </div>
                  )}
                </div>
              )}

              {/* Priority Review Queue */}
              {job?.status === 'waiting_review' && (
                <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200 flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 text-[20px]">rule</span>
                      <h3 className="text-meta font-bold text-stone-900">
                        Hàng đợi duyệt đề xuất Story Brain ({reviewGroups.length} nhóm)
                      </h3>
                    </div>
                    <button
                      type="button"
                      disabled={reviewGroups.length > 0 || activateMutation.isPending}
                      onClick={() => activateMutation.mutate()}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-meta font-semibold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">verified</span>
                      <span>Kích hoạt Story Brain Baseline</span>
                    </button>
                  </div>

                  {reviewGroups.length === 0 ? (
                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-center text-meta text-emerald-800">
                      Tất cả các đề xuất đối chiếu đã được duyệt! Bạn có thể kích hoạt baseline ngay bây giờ.
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
                                Ưu tiên {Math.max(...proposals.map((p) => p.review_priority))}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 text-meta">
                                {proposals[0].review_reason}
                              </span>
                            </div>
                            <span className="text-meta font-semibold text-stone-900">
                              {proposals.map((p) => p.proposal_type).join(', ')}
                            </span>
                            <pre className="text-meta font-mono bg-white p-2 rounded border border-stone-200 overflow-x-auto text-stone-700">
                              {JSON.stringify(
                                proposals.map((p) => p.payload),
                                null,
                                2
                              )}
                            </pre>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                            <button
                              type="button"
                              onClick={() => acceptMutation.mutate({ groupId, proposals })}
                              className="px-2.5 py-1 rounded bg-primary-600 hover:bg-primary-700 text-white text-meta font-semibold transition-colors cursor-pointer"
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
            </div>
          </div>
        </div>
      </main>

      {/* ──────────────────────────────────────────
          Direct Text / Manuscript Paste Modal
         ────────────────────────────────────────── */}
      {pasteModalOpen && (
        <AuthorDialog onClose={() => setPasteModalOpen(false)}><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 max-w-2xl w-full p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-600 text-[22px]">edit_note</span>
                <h3 className="text-body font-bold text-stone-900">Dán hoặc chỉnh sửa văn bản bản thảo</h3>
              </div>
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="text-meta text-stone-500">
              Dán toàn bộ nội dung bản thảo hoặc các chương tại đây. Bộ phân tích sẽ tự động tách chương theo quy tắc nhận diện.
            </p>
            <textarea
              rows={12}
              value={tempPasteText}
              onChange={(e) => setTempPasteText(e.target.value)}
              placeholder="Dán nội dung bản thảo tại đây... (Ví dụ: Chương 1: ..., Chương 2: ...)"
              className="w-full bg-stone-50 border border-stone-200 rounded-lg p-3 font-mono text-meta text-stone-800 focus:outline-none focus:bg-white focus:border-primary-600 focus:ring-1 focus:ring-primary-600"
            />
            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
              <span className="text-meta text-stone-400">
                {tempPasteText.length.toLocaleString()} ký tự
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPasteModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-meta font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRawText(tempPasteText);
                    setFileName('manuscript_pasted_content.txt');
                    setFileSizeStr(`${Math.round(tempPasteText.length / 1024)} KB`);
                    setPasteModalOpen(false);
                    showToast('Đã cập nhật nội dung bản thảo từ văn bản vừa dán!');
                  }}
                  className="px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-meta font-semibold cursor-pointer shadow-2xs"
                >
                  Áp dụng &amp; Phân tích
                </button>
              </div>
            </div>
          </div>
        </div></AuthorDialog>
      )}

      {/* ──────────────────────────────────────────
          Toast Feedback Notification
         ────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-stone-900 text-white text-meta font-medium px-4 py-2.5 rounded-lg shadow-sm animate-in  duration-200">
          <span className="material-symbols-outlined text-[18px] text-emerald-400">info</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
