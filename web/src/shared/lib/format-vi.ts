const absoluteDateTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const relativeDateTime = new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' });
const relativeUnits = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60]
] as const;

export function formatDateTime(
  value: string | number | Date | null | undefined,
  mode: 'absolute' | 'relative' = 'absolute',
  now = Date.now()
): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  if (mode === 'relative') {
    const seconds = (date.getTime() - now) / 1000;
    const unit = relativeUnits.find(([, size]) => Math.abs(seconds) >= size);
    if (!unit) return seconds > 0 ? 'Sắp tới' : 'Vừa xong';
    return relativeDateTime.format(Math.trunc(seconds / unit[1]), unit[0]);
  }
  const parts = absoluteDateTime.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('hour')}:${part('minute')} ${part('day')}/${part('month')}/${part('year')}`;
}

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  value.toLocaleString('vi-VN', options);
