import { useState } from 'react';
import { Select, Textarea } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { reportContent } from './reader-api';

const reasons = ['Vi phạm bản quyền', 'Nội dung không phù hợp', 'Thông tin gây hiểu nhầm', 'Spam hoặc quảng cáo', 'Lý do khác'];

export function NovelReportDialog({ novelId, onSuccess }: { novelId: string; onSuccess: () => void }) {
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [validation, setValidation] = useState(false);
  const report = useMutation({
    mutationFn: () => reportContent({ targetType: 'NOVEL', targetId: novelId, reason: reason!, description: description.trim() || undefined }),
    onSuccess: () => { setOpened(false); setReason(null); setDescription(''); onSuccess(); }
  });
  const close = () => { if (!report.isPending) setOpened(false); };
  return <>
    <button type="button" className="sc-button sc-report-trigger" aria-label="Báo cáo truyện" title="Báo cáo truyện" onClick={() => { report.reset(); setValidation(false); setOpened(true); }}>
      <span className="material-symbols-outlined" aria-hidden="true">flag</span><span className="hidden sm:inline" aria-hidden="true">Báo cáo</span>
    </button>
    <AnimatedModal opened={opened} onClose={close} title="Báo cáo truyện" centered withCloseButton={!report.isPending} closeOnEscape={!report.isPending} closeOnClickOutside={!report.isPending}>
      <form className="sc-novel-report-form" onSubmit={event => { event.preventDefault(); setValidation(true); if (reason && (reason !== 'Lý do khác' || description.trim().length >= 3) && !report.isPending) report.mutate(); }}>
        <Select label="Lý do báo cáo" placeholder="Chọn lý do" required data={reasons} value={reason} onChange={setReason} disabled={report.isPending} error={validation && !reason ? 'Hãy chọn lý do báo cáo.' : undefined} comboboxProps={{ withinPortal: false }} />
        <Textarea label="Chi tiết" description="Tối đa 2.000 ký tự." required={reason === 'Lý do khác'} maxLength={2000} minRows={4} value={description} onChange={event => setDescription(event.currentTarget.value)} disabled={report.isPending} error={validation && reason === 'Lý do khác' && description.trim().length < 3 ? 'Nhập ít nhất 3 ký tự để mô tả lý do.' : undefined} />
        {report.isError && <p className="sc-report-error" role="alert">{getApiErrorMessage(report.error)}</p>}
        <div className="sc-novel-report-actions"><button type="button" className="sc-button" onClick={close} disabled={report.isPending}>Hủy</button><button type="submit" className="sc-button sc-button-primary" disabled={report.isPending}>{report.isPending ? 'Đang gửi…' : 'Gửi báo cáo'}</button></div>
      </form>
    </AnimatedModal>
  </>;
}
