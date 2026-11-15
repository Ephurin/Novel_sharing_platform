import type { ApprovedMemory } from '../ai-copilot/author-memory-api';

const types: Record<string, string> = { LOC: 'Địa danh', ORG: 'Tổ chức', ITEM: 'Vật phẩm', SKILL: 'Kỹ năng' };
const textValue = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value);

export function StoryBibleKnowledge({ memory, loading, failed, retry }: {
  memory?: ApprovedMemory; loading: boolean; failed: boolean; retry: () => void;
}) {
  if (loading) return <p role="status">Đang tải dữ kiện đã duyệt…</p>;
  if (failed) return <p role="alert">Chưa tải được dữ kiện từ Story Brain. <button type="button" onClick={retry}>Thử lại</button></p>;
  const entities = memory?.entities.filter(e => !['PER', 'CHARACTER', 'PERSON'].includes(e.entity_type.toUpperCase())) ?? [];
  const facts = memory?.facts ?? [];
  return <section className="space-y-5" aria-label="Địa danh và dữ kiện đã duyệt">
    <p className="text-sm text-stone-600">Dữ liệu đã được duyệt trong Story Brain. Nhân vật, quan hệ và sự kiện được đưa vào các mục tương ứng của Cẩm nang; thông tin tác giả bổ sung được giữ lại.</p>
    {!entities.length && !facts.length && <p>Chưa có địa danh, vật phẩm hoặc dữ kiện đã duyệt.</p>}
    <div className="grid gap-3 md:grid-cols-2">{entities.map(entity => <article key={entity.entity_id} className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{types[entity.entity_type] ?? entity.entity_type} · Đã duyệt</p>
      <h3 className="font-semibold">{entity.name}</h3>
      {(memory?.aliases ?? []).some(a => a.entity_id === entity.entity_id) && <p className="text-sm">Tên khác: {(memory?.aliases ?? []).filter(a => a.entity_id === entity.entity_id).map(a => a.alias).join(', ')}</p>}
    </article>)}</div>
    {facts.length > 0 && <div className="space-y-3"><h3 className="font-semibold">Dữ kiện và quy tắc thế giới</h3>{facts.map((fact, i) => <article key={fact.fact_id ?? i} className="rounded-xl border border-stone-200 bg-white p-4">
      <h4 className="font-semibold">{fact.fact_key}</h4>
      {fact.subject_entity_id && <p className="text-sm text-stone-500">{memory?.entities.find(e => e.entity_id === fact.subject_entity_id)?.name ?? 'Thực thể đã duyệt'}</p>}
      <p className="whitespace-pre-wrap text-sm">{textValue(fact.fact_value)}</p>
    </article>)}</div>}
  </section>;
}
