import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { appointmentService, notificationRepository } from '@spartan-g/shared-services';
import { notificationRoute, UiNotification } from '../../lib/notificationRouting';

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<UiNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const applyNotifications = useCallback((notifs: UiNotification[]) => {
    setNotifications(notifs);
    setUnreadCount(notifs.filter((n) => !n.isRead).length);
  }, []);

  useEffect(() => {
    if (!user) {
      applyNotifications([]);
      return;
    }

    // Real-time subscription (mirrors the other dashboard-list subscriptions)
    // so new in-app notifications appear instantly.
    const unsubscribe = notificationRepository.subscribeByUserId(
      user.uid,
      (notifs) => applyNotifications((notifs as unknown) as UiNotification[]),
      (error) => console.error('Failed to subscribe to notifications:', error),
    );

    return () => {
      unsubscribe();
    };
  }, [user, applyNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleMarkRead = async (notifId: string) => {
    try {
      await appointmentService.markNotificationRead(notifId);
      setNotifications(prev =>
        prev.map(n => n.id === notifId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    try {
      await appointmentService.markAllNotificationsRead(user.uid);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  /** Mark the notification read and redirect the user to the related page. */
  const handleOpenNotification = (notif: UiNotification) => {
    const route = notificationRoute(user?.role, notif);
    if (!notif.isRead) {
      void handleMarkRead(notif.id);
    }
    setIsOpen(false);
    if (route) navigate(route);
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative inline-flex items-center justify-center rounded-[var(--radius-md)] p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-primary)] transition-all duration-150"
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-dropdown border border-[var(--color-border)] z-50 max-h-[70vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-light)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                <svg className="w-10 h-10 mx-auto mb-2 text-[var(--color-text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleOpenNotification(notif)}
                  className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-light)] hover:bg-[var(--color-bg-alt)] transition-colors duration-150 ${
                    !notif.isRead ? 'bg-[var(--color-primary)]/[0.03]' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon based on type */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      notif.type === 'reschedule'
                        ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
                        : notif.type === 'message'
                        ? 'bg-[var(--color-info-bg)] text-[var(--color-info)]'
                        : notif.type === 'assessment' || notif.type === 'assignment' || notif.type === 'grade'
                        ? 'bg-[var(--color-primary-pastel)] text-[var(--color-primary)]'
                        : notif.type === 'risk'
                        ? 'bg-red-50 text-red-600'
                        : notif.type === 'appointment' || notif.type === 'work_hours'
                        ? 'bg-[var(--color-info-bg)] text-[var(--color-info)]'
                        : 'bg-[var(--color-bg-alt)] text-[var(--color-text-muted)]'
                    }`}>
                      {notif.type === 'reschedule' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                        </svg>
                      ) : notif.type === 'message' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.753 9.753 0 01-3.555-.732A5.122 5.122 0 015.634 18 5.125 5.125 0 015.25 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                        </svg>
                      ) : notif.type === 'assessment' || notif.type === 'assignment' || notif.type === 'grade' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                        </svg>
                      ) : notif.type === 'risk' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notif.isRead ? 'font-semibold' : 'font-medium'} text-[var(--color-text)] truncate`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">{notif.body}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">{formatTime(notif.created_at)}</p>
                    </div>
                    {!notif.isRead && (
                      <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}