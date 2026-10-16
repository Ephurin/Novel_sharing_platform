import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { listNotifications, markNotificationRead, registerWebPushToken, type AppNotification } from './notification-api';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { PageTitle } from '../../shared/components/PageTitle';
import { card, secondaryButton, textButton, textInput } from '../../shared/components/ui-classes';

type StatusFilter = 'ALL' | 'UNREAD' | 'READ';

const filters: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'UNREAD', label: 'Chưa đọc' },
  { value: 'READ', label: 'Đã đọc' }
];

const typeIcons: Array<[RegExp, string]> = [
  [/COMMENT/, 'forum'],
  [/REPORT|MODERATION|REJECT/, 'gavel'],
  [/WALLET|DONAT|WITHDRAW|DEPOSIT|UNLOCK/, 'toll'],
  [/FOLLOW/, 'person_add'],
  [/CHAPTER|NOVEL|PUBLISH/, 'menu_book']
];

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [deviceToken, setDeviceToken] = useState(`web-token-${Date.now()}`);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const notificationsQuery = useQuery({
    queryKey: ['notifications', statusFilter],
    queryFn: () => listNotifications(statusFilter === 'ALL' ? undefined : statusFilter)
  });
  const unreadQuery = useQuery({ queryKey: ['notifications', 'UNREAD'], queryFn: () => listNotifications('UNREAD') });

  const markReadMutation = useMutation({
    mutationFn: (notification: AppNotification) => markNotificationRead(notification.notificationId),
    onSuccess: async () => {
      setStatusMessage('Đã đánh dấu thông báo là đã đọc.');
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const registerTokenMutation = useMutation({
    mutationFn: () => registerWebPushToken(deviceToken),
    onSuccess: () => setStatusMessage('Đã đăng ký thiết bị nhận thông báo đẩy.')
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadQuery.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <PageTitle
        title="Thông báo"
        description="Cập nhật về bình luận, kiểm duyệt, ví và tác phẩm của bạn."
        actions={
          unreadCount ? (
            <span className="text-[12px] font-semibold text-primary-700 bg-primary-50 border border-primary-200/70 px-2.5 py-1 rounded-full">
              {unreadCount} chưa đọc
            </span>
          ) : null
        }
      />

      {statusMessage ? (
        <div className="flex items-start gap-2 text-[12px] text-primary-800 bg-primary-50 border border-primary-200/70 rounded-lg px-3 py-2">
          <span className="material-symbols-outlined text-[16px]">info</span>
          <span>{statusMessage}</span>
        </div>
      ) : null}

      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-stone-200/80">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`px-3 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer ${
                statusFilter === filter.value
                  ? 'bg-primary-50 text-primary-700 font-semibold border border-primary-200/70'
                  : 'text-stone-600 hover:bg-stone-100 border border-transparent font-medium'
              }`}
            >
              {filter.label}
              {filter.value === 'UNREAD' && unreadCount ? <span className="ml-1.5 text-[11px]">({unreadCount})</span> : null}
            </button>
          ))}
        </div>

        {notificationsQuery.isLoading ? <div className="p-4"><LoadingState label="Đang tải thông báo..." /></div> : null}
        {notificationsQuery.isError ? (
          <div className="p-4">
            <ErrorState error={notificationsQuery.error} onRetry={() => void notificationsQuery.refetch()} />
          </div>
        ) : null}
        {!notificationsQuery.isLoading && !notificationsQuery.isError && !notifications.length ? (
          <div className="py-14 flex flex-col items-center text-center">
            <span className="material-symbols-outlined text-[36px] text-stone-300 mb-1">notifications_off</span>
            <p className="text-[13px] text-stone-500">Không có thông báo nào.</p>
          </div>
        ) : null}

        {!notificationsQuery.isLoading && !notificationsQuery.isError ? (
          <ul className="divide-y divide-stone-100">
            {notifications.map((notification) => {
              const unread = notification.status === 'UNREAD';
              return (
                <li
                  key={notification.notificationId}
                  className={`flex items-start gap-3.5 px-5 py-4 transition-colors ${unread ? 'bg-primary-50/40' : 'hover:bg-[#f9f8f4]/60'}`}
                  data-testid={`notification-card-${notification.notificationId}`}
                >
                  <span
                    className={`relative w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                      unread ? 'bg-white border-primary-200 text-primary-600' : 'bg-stone-50 border-stone-200 text-stone-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{iconForType(notification.type)}</span>
                    {unread ? <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary-600 border-2 border-white"></span> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-[14px] ${unread ? 'font-semibold text-stone-900' : 'font-medium text-stone-700'}`}>
                        {notification.title}
                      </p>
                      <span
                        className="text-[10.5px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-px rounded"
                        data-testid={`notification-type-${notification.type}`}
                      >
                        {notification.type}
                      </span>
                    </div>
                    <p className="text-[13px] text-stone-600 mt-0.5 leading-relaxed">{notification.content}</p>
                    <time className="text-[11px] text-stone-400 mt-1 block">{new Date(notification.createdAt).toLocaleString('vi-VN')}</time>
                  </div>
                  {unread ? (
                    <button
                      type="button"
                      onClick={() => markReadMutation.mutate(notification)}
                      disabled={markReadMutation.isPending}
                      className={`${textButton} text-primary-700 hover:bg-primary-50 shrink-0`}
                    >
                      <span className="material-symbols-outlined text-[15px]">done</span>
                      Đã đọc
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <details className={`${card} p-5 group`}>
        <summary className="flex items-center gap-2 cursor-pointer list-none text-[13px] font-medium text-stone-600">
          <span className="material-symbols-outlined text-[18px] text-stone-400 group-open:rotate-90 transition-transform">chevron_right</span>
          Thông báo đẩy trên trình duyệt (thử nghiệm)
        </summary>
        <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
          <input
            value={deviceToken}
            onChange={(event) => setDeviceToken(event.currentTarget.value)}
            className={textInput}
            aria-label="Mã thiết bị web push"
          />
          <button
            type="button"
            onClick={() => registerTokenMutation.mutate()}
            disabled={registerTokenMutation.isPending}
            className={`${secondaryButton} shrink-0`}
          >
            <span className="material-symbols-outlined text-[16px] text-stone-400">devices</span>
            <span>Đăng ký thiết bị</span>
          </button>
        </div>
      </details>
    </div>
  );
}

function iconForType(type: string) {
  return typeIcons.find(([pattern]) => pattern.test(type))?.[1] ?? 'notifications';
}
