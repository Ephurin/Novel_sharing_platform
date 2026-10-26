import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Alert, Button, Group, Modal, Pagination, Textarea } from '@mantine/core';
import { AdminIcon } from './AdminShell';

export const number = (value: number) => value.toLocaleString('vi-VN');
export const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('vi-VN', {
        timeZone: 'Asia/Bangkok',
        dateStyle: 'short',
        timeStyle: 'short'
      })
    : '—';
export const labels: Record<string, string> = {
  ACTIVE: 'Hoạt động',
  LOCKED: 'Đã khóa',
  DELETED: 'Đã xóa',
  DRAFT: 'Bản nháp',
  PENDING_MODERATION: 'Chờ kiểm duyệt',
  PUBLISHED: 'Đã xuất bản',
  REJECTED: 'Đã từ chối',
  APPROVED: 'Đã duyệt',
  PENDING: 'Chờ xử lý',
  REVISION_REQUIRED: 'Cần chỉnh sửa',
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng',
  NOVEL: 'Truyện',
  CHAPTER: 'Chương',
  COMMENT: 'Bình luận',
  USER: 'Người dùng',
  KEYWORD_FILTER: 'Từ khóa',
  USER_REPORT: 'Báo cáo người dùng',
  SUCCESS: 'Thành công',
  FAILED: 'Đã từ chối',
  ARCHIVED: 'Lưu trữ'
};
export const options = (values: string[], all = 'Tất cả') => [
  { value: '', label: all },
  ...values.map((value) => ({ value, label: labels[value] || value }))
];
export function Status({ value }: { value: string }) {
  return (
    <span className={`admin-status status-${value.toLowerCase()}`}>{labels[value] || value}</span>
  );
}
export function AdminHeader({
  title,
  description,
  children,
  refresh
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  refresh?: () => void;
}) {
  return (
    <div className="admin-page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <Group gap="sm">
        {children}
        {refresh && (
          <Button variant="default" leftSection={<AdminIcon name="refresh" />} onClick={refresh}>
            Làm mới dữ liệu
          </Button>
        )}
      </Group>
    </div>
  );
}
export function AdminPanel({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`admin-panel ${className}`}>{children}</section>;
}
export type PageMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
};
export function AdminPagination({
  meta,
  onChange
}: {
  meta?: PageMeta;
  onChange: (page: number) => void;
}) {
  useEffect(() => {
    if (meta && meta.page > Math.max(1, meta.totalPages)) onChange(Math.max(1, meta.totalPages));
  }, [meta?.page, meta?.totalPages, onChange]);
  if (!meta || !meta.totalItems) return null;
  return (
    <div className="admin-pagination">
      <span>
        Hiển thị {number(Math.min((meta.page - 1) * meta.limit + 1, meta.totalItems))} –{' '}
        {number(Math.min(meta.page * meta.limit, meta.totalItems))} của {number(meta.totalItems)}{' '}
        mục
      </span>
      <Pagination
        total={Math.max(1, meta.totalPages)}
        value={meta.page}
        onChange={onChange}
        size="sm"
        aria-label="Phân trang"
      />
    </div>
  );
}
export function AdminError({ error }: { error: unknown }) {
  return error ? (
    <Alert color="red" role="alert">
      {error instanceof Error ? error.message : 'Không thể thực hiện thao tác'}
    </Alert>
  ) : null;
}
export function AdminConfirm({
  opened,
  title,
  children,
  reason,
  setReason,
  required = false,
  destructive = false,
  confirmLabel,
  pending,
  error,
  onClose,
  onConfirm
}: {
  opened: boolean;
  title: string;
  children: ReactNode;
  reason?: string;
  setReason?: (value: string) => void;
  required?: boolean;
  destructive?: boolean;
  confirmLabel: string;
  pending?: boolean;
  error?: unknown;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
    >
      <div className="admin-confirm">
        <div>{children}</div>
        {setReason && (
          <Textarea
            label="Lý do xử lý"
            required={required}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={1000}
            minRows={3}
          />
        )}
        <AdminError error={error} />
        <Group justify="flex-end">
          <Button variant="default" disabled={pending} onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button
            color={destructive ? 'red' : undefined}
            className={destructive ? 'admin-danger' : undefined}
            loading={pending}
            disabled={required && !reason?.trim()}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Group>
      </div>
    </Modal>
  );
}
