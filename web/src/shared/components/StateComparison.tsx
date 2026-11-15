import './workspace-tools.css';

const names: Record<string, string> = { summary: 'Tóm tắt', canonical_name: 'Tên chuẩn', entity_type: 'Loại thực thể', participants: 'Nhân vật tham gia', participant_entity_ids: 'Nhân vật tham gia', description: 'Mô tả', fact_key: 'Thuộc tính', fact_value: 'Giá trị', new_value: 'Giá trị mới', old_value: 'Giá trị trước', entity_id: 'Thực thể', entity_name: 'Tên thực thể', name: 'Tên', title: 'Tiêu đề', status: 'Trạng thái', role: 'Vai trò', reason: 'Lý do', confidence: 'Độ tin cậy', content: 'Nội dung', source_entity_id: 'Thực thể nguồn', target_entity_id: 'Thực thể đích', relation_type: 'Quan hệ', is_retired: 'Ngừng sử dụng', start_chapter: 'Chương bắt đầu', end_chapter: 'Chương kết thúc' };
const print = (value: unknown) => value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
/** Compare actual values; original data remains available to the caller. */
export function StateComparison({ before, after, beforeLabel = 'Trước', afterLabel = 'Sau' }: { before: unknown; after: unknown; beforeLabel?: string; afterLabel?: string }) {
  const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : { value };
  const left = object(before), right = object(after);
  const changed = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(key => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
  return <details className="sc-state-comparison"><summary>So sánh thay đổi ({changed.length})</summary>
    {changed.length ? changed.map(key => <div key={key}><strong className="text-meta">{names[key] ?? key}</strong><div className="sc-diff-grid"><div><span className="text-meta">{beforeLabel}</span><pre>{print(left[key])}</pre></div><div><span className="text-meta">{afterLabel}</span><pre>{print(right[key])}</pre></div></div></div>) : <p className="text-meta">Không có giá trị thay đổi.</p>}
  </details>;
}
