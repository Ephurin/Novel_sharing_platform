import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type BootstrapRevisionInput = {
  chapter_id: string;
  revision_id: string;
  content_hash: string;
};

export type BootstrapJob = {
  job_id: string;
  novel_id: string;
  /** waiting_entity_review: paused after one chapter until the author settles it (sequential import). */
  status: 'queued' | 'running' | 'waiting_entity_review' | 'waiting_review' | 'completed' | 'failed';
  stage: string;
  progress: { current: number; total: number; unit: string; stage: string };
  result: { proposal_count?: number; required_proposal_ids?: string[]; awaiting_chapter?: number; awaiting_analysis_run_id?: string } | null;
  error: { message?: string } | null;
};

export type ReviewProposal = {
  proposal_id: string;
  proposal_type: string;
  dependency_group_id: string;
  payload: Record<string, unknown>;
  confidence: number | null;
  review_priority: number;
  review_reason: string;
};

export type StoryBrainSummary = {
  id: string;
  novel_id: string;
  status: string;
  brain_version: number;
  baseline_revision_id: string | null;
  counts: { entities: number; events: number; pending_proposals: number; open_findings: number };
};

export async function startManuscriptBootstrap(novelId: string, revisions: BootstrapRevisionInput[]) {
  const response = await apiClient.post<ApiEnvelope<{ job_id: string; story_brain_id: string; status: string }>>(
    '/ai/story-brains/bootstrap/from-manuscript',
    {
      novel_id: novelId,
      revisions,
      locale: 'vi-VN',
      options: { extract_world_rules: true, build_embeddings: false, require_review_for_all: true }
    }
  );
  return response.data.data;
}

export async function getBootstrapJob(jobId: string) {
  const response = await apiClient.get<ApiEnvelope<BootstrapJob>>(`/ai/jobs/${jobId}`);
  return response.data.data;
}

export async function resumeBootstrapJob(jobId: string) {
  const response = await apiClient.post<ApiEnvelope<BootstrapJob>>(`/ai/jobs/${jobId}/resume`);
  return response.data.data;
}

export async function getReviewQueue(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<ReviewProposal[]>>(`/ai/story-brains/${novelId}/review-queue`);
  return response.data.data;
}

export async function getStoryBrainSummary(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<StoryBrainSummary>>(`/ai/story-brains/by-novel/${novelId}`);
  return response.data.data;
}

export async function acceptProposalGroup(groupId: string, proposalIds: string[], version: number) {
  const response = await apiClient.post<ApiEnvelope<{ brain_version: number }>>(
    `/ai/proposal-groups/${groupId}/accept`,
    {
      proposal_ids: proposalIds,
      expected_brain_version: version,
      reason: 'Reviewed during manuscript import'
    }
  );
  return response.data.data;
}

export async function rejectProposal(proposalId: string) {
  await apiClient.post(`/ai/proposals/${proposalId}/reject`, {
    reason: 'Rejected during manuscript import'
  });
}

export async function activateBaseline(novelId: string, jobId: string) {
  const response = await apiClient.post<ApiEnvelope<StoryBrainSummary>>(
    `/ai/story-brains/${novelId}/baseline/activate`,
    {
      job_id: jobId
    }
  );
  return response.data.data;
}

export interface ParsedChapterItem {
  id: string;
  sourceIndex: number;
  targetNumber: number;
  title: string;
  content: string;
  wordCount: number;
  isValid: boolean;
  validationMessage?: string;
}

export function normalizeManuscriptText(
  text: string,
  options: {
    normalizePunctuation?: boolean;
    removeExtraBlankLines?: boolean;
    preserveDialogue?: boolean;
  } = {}
): string {
  let res = text;
  if (options.normalizePunctuation) {
    res = res
      .replace(/"([^"]*)"/g, '“$1”')
      .replace(/\.{3,}/g, '…')
      .replace(/ - /g, ' — ');
  }
  if (options.removeExtraBlankLines) {
    res = res.replace(/(\r?\n){3,}/g, '\n\n');
  }
  return res;
}

export function parseManuscriptChapters(
  rawText: string,
  regexPattern: string,
  startingChapterNumber: number = 1
): ParsedChapterItem[] {
  if (!rawText.trim()) return [];

  let regex: RegExp;
  try {
    if (regexPattern.startsWith('/') && regexPattern.lastIndexOf('/') > 0) {
      const lastSlash = regexPattern.lastIndexOf('/');
      const body = regexPattern.slice(1, lastSlash);
      const flags = regexPattern.slice(lastSlash + 1);
      regex = new RegExp(body, flags.includes('g') ? flags : flags + 'g');
    } else {
      regex = new RegExp(regexPattern, 'gim');
    }
  } catch {
    regex = /(?:^|\n)\s*(?:Chương|Hồi|Chapter|Phần)\s+\d+[:\s\.\-—]?.*?(?=\n|$)/gim;
  }

  const matches: Array<{ index: number; fullMatch: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(rawText)) !== null) {
    matches.push({
      index: m.index,
      fullMatch: m[0],
      title: m[0].trim().replace(/^[\r\n]+|[\r\n]+$/g, '')
    });
    if (regex.lastIndex === m.index) {
      regex.lastIndex++;
    }
  }

  if (matches.length === 0) {
    const trimmed = rawText.trim();
    const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    return [
      {
        id: 'ch-01',
        sourceIndex: 1,
        targetNumber: startingChapterNumber,
        title: `Chương ${startingChapterNumber}: [Chưa có tên]`,
        content: trimmed,
        wordCount,
        isValid: false,
        validationMessage: 'Không khớp quy tắc tách chương nào'
      }
    ];
  }

  const items: ParsedChapterItem[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const startIndex = current.index + current.fullMatch.length;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
    const chapterContent = rawText.slice(startIndex, endIndex).trim();
    const wordCount = chapterContent ? chapterContent.split(/\s+/).filter(Boolean).length : 0;
    const title = current.title.trim();
    const hasMeaningfulTitle =
      title.length > 3 && !title.includes('[Chưa có tên]') && !title.includes('[Không tên]');

    items.push({
      id: `ch-${i + 1}`,
      sourceIndex: i + 1,
      targetNumber: startingChapterNumber + i,
      title,
      content: chapterContent,
      wordCount,
      isValid: hasMeaningfulTitle && wordCount > 0,
      validationMessage: !hasMeaningfulTitle
        ? 'Thiếu tiêu đề chương'
        : wordCount === 0
        ? 'Nội dung chương trống'
        : undefined
    });
  }

  return items;
}

export interface ImportedChapterResult {
  chapter: {
    chapterId: string;
    novelId: string;
    title: string;
    chapterNumber: number;
    wordCount: number;
    isVip: boolean;
    priceCoins: number;
  };
  revision: {
    revisionId: string;
    contentHash: string;
    chapterId: string;
    novelId: string;
    wordCount: number;
  };
}

export async function importChaptersBatch(
  novelId: string,
  chapters: Array<{ title: string; content: string; isVip?: boolean; priceCoins?: number }>,
  onProgress?: (current: number, total: number, stage?: string) => void
): Promise<ImportedChapterResult[]> {
  const results: ImportedChapterResult[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const fingerprint = new TextEncoder().encode(JSON.stringify([novelId, i, ch.title, ch.content]));
    const clientRequestId = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', fingerprint)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (onProgress) {
      onProgress(i, chapters.length, `Đang tạo chương ${i + 1}/${chapters.length}: ${ch.title}`);
    }

    // 1. Persist chapter
    let chapterData: any;
    try {
      const response = await apiClient.post<ApiEnvelope<any>>(`/novels/${novelId}/chapters`, {
        title: ch.title,
        content: ch.content,
        clientRequestId,
        isVip: ch.isVip ?? false,
        priceCoins: ch.priceCoins ?? 0
      });
      chapterData = response.data.data;
    } catch (err: any) {
      throw new Error(`Lỗi khi tạo chương "${ch.title}": ${err?.message || 'Không thể tạo chương'}`);
    }

    if (onProgress) {
      onProgress(i, chapters.length, `Đang tạo snapshot revision cho chương: ${ch.title}`);
    }

    // 2. Create canonical immutable revision snapshot
    let revisionData: any;
    try {
      const snapResponse = await apiClient.post<ApiEnvelope<any>>(
        `/chapters/${chapterData.chapterId}/revisions/snapshot`,
        { content: ch.content, purpose: 'MANUSCRIPT_BOOTSTRAP' }
      );
      revisionData = snapResponse.data.data;
    } catch (err: any) {
      throw new Error(`Lỗi khi tạo snapshot revision cho chương "${ch.title}" (${chapterData.chapterId}): ${err?.message || 'Không thể tạo snapshot'}`);
    }

    results.push({
      chapter: chapterData,
      revision: revisionData
    });

    if (onProgress) {
      onProgress(i + 1, chapters.length, `Đã hoàn tất chương ${i + 1}/${chapters.length}`);
    }
  }
  return results;
}

const JOB_STATUS_LABELS: Record<string, string> = {
  queued: 'Đang xếp hàng', running: 'Đang phân tích', waiting_entity_review: 'Chờ bạn duyệt chương',
  waiting_review: 'Chờ duyệt đề xuất', completed: 'Hoàn tất', failed: 'Gặp lỗi', cancelled: 'Đã huỷ'
};
const JOB_STAGE_LABELS: Record<string, string> = {
  queued: 'xếp hàng', chapter_analysis: 'phân tích chương', chapter_review: 'duyệt chương',
  review: 'duyệt đề xuất', failed: 'dừng do lỗi', completed: 'hoàn tất'
};
/** Author-facing Vietnamese labels for bootstrap job status and stage (raw values stay in the API). */
export const jobStatusLabel = (status: string) => JOB_STATUS_LABELS[status] ?? status;
export const jobStageLabel = (stage: string) => JOB_STAGE_LABELS[stage] ?? stage;

/** Author-facing text for a failed bootstrap job; the raw message stays available in the API. */
export function jobErrorLabel(message: string): string {
  if (/RPM_LIMIT|TPM_LIMIT|RPD_LIMIT|CONCURRENCY_LIMIT|PROVIDER_RATE_LIMITED|quota/i.test(message))
    return 'AI đang chạm giới hạn tần suất của gói miễn phí. Đợi khoảng một phút rồi bấm “Thử lại từ chương còn dở”.';
  if (/BUDGET_GUARD_DENIED|FREE_TIER_STATUS_UNVERIFIED|PROVIDER_UNAVAILABLE|PROVIDER_TIMEOUT|upstream_status|503|504/i.test(message))
    return 'AI tạm thời không phản hồi (dịch vụ quá tải hoặc chưa được bật). Các chương đã phân tích vẫn được giữ; bấm “Thử lại từ chương còn dở” sau ít phút.';
  return message;
}

/** User-facing reason the next chapter cannot be analysed yet, or null for other errors. */
export function nextChapterBlockedMessage(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'BOOTSTRAP_CHAPTER_REVIEW_PENDING')
    return 'Chương này chưa duyệt xong: hãy xác nhận nhân vật (Bộ nhớ → Chờ duyệt, rồi bấm Tiếp tục) và duyệt hết các đề xuất của chương, sau đó phân tích chương tiếp theo.';
  return null;
}

/** User-facing reason a manuscript baseline cannot be activated yet, or null for other errors. */
export function baselineActivationBlockedMessage(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'BOOTSTRAP_ENTITY_REVIEW_PENDING')
    return 'Chưa thể kích hoạt bộ nhớ: còn chương đang chờ bạn xác nhận nhân vật. Hãy hoàn tất duyệt nhân vật, rồi duyệt các đề xuất sinh ra, sau đó kích hoạt lại.';
  if (code === 'BASELINE_REVIEW_REQUIRED')
    return 'Chưa thể kích hoạt bộ nhớ: còn đề xuất từ các chương đã trích xuất đang chờ duyệt ở tab “Chờ duyệt”.';
  return null;
}
