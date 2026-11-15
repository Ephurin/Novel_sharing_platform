import { Link } from 'react-router-dom';
import { AnimatedModal } from './AnimatedModal';
import { CopyTextButton, FeedbackReveal } from './ActionFeedback';
import './workspace-tools.css';

type PreviewRecord = { id: string; title: string; to: string; fields: Array<[string, string]> };
export function WorkspacePreview({ records, selected, onSelect }: { records: PreviewRecord[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const index = records.findIndex(record => record.id === selected), record = records[index];
  return <AnimatedModal opened={Boolean(record)} onClose={() => onSelect(null)} title={record?.title ?? 'Xem nhanh'} side="right" size="lg">
    {record && <><p className="text-meta" role="status">{index + 1}/{records.length} bản ghi trong trang này</p><FeedbackReveal key={record.id}><dl className="sc-preview-fields">{record.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></FeedbackReveal>
      <CopyTextButton value={[record.title, ...record.fields.map(([label, value]) => `${label}: ${value}`)].join('\n')} label="Sao chép thông tin" />
      <div className="sc-workspace-row"><button type="button" className="sc-workspace-button" disabled={index <= 0} onClick={() => onSelect(records[index - 1].id)}>Trước</button><button type="button" className="sc-workspace-button" disabled={index === records.length - 1} onClick={() => onSelect(records[index + 1].id)}>Sau</button><Link className="sc-workspace-button" to={record.to} onClick={() => onSelect(null)}>Mở chi tiết</Link></div></>}
  </AnimatedModal>;
}
