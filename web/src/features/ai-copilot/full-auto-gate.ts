// Live retest 3 (P3): "Bật full auto" required brain.baseline_revision_id, which only manuscript import
// sets, so a story begun from an idea could never start it, and the tab gave no reason. The server
// needs an active plan that it generated (author-written plans are not supported yet).
export type FullAutoInput = {
  brainStatus: string | null | undefined;
  plan: { plan_id: string; autonomy_blocked?: string | null } | null | undefined;
  planLoading?: boolean;
};

export function fullAutoBlockReason({ brainStatus, plan, planLoading }: FullAutoInput): string | null {
  if (brainStatus !== 'active') {
    return 'Cần kích hoạt bộ nhớ truyện trước (trích xuất từ chương đã lưu hoặc kích hoạt thiết lập trong Planning Studio).';
  }
  if (planLoading) return 'Đang đọc dàn ý…';
  if (!plan) {
    return 'Truyện chưa có dàn ý đang dùng. Hãy duyệt và kích hoạt một dàn ý trước khi bật chế độ tự động.';
  }
  if (plan.autonomy_blocked === 'MANUAL_PLAN_AUTONOMY_NOT_AVAILABLE') {
    return 'Dàn ý đang dùng do bạn soạn hoặc sửa trong Planning Studio. Chế độ tự động hiện chỉ chạy với dàn ý do hệ thống lập.';
  }
  return null;
}
