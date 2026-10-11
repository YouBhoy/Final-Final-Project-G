import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConversationList } from '../../components/messaging/ConversationList';
import { MessageThread } from '../messaging/MessageThread';
import { useConversationList } from '../../hooks/useConversationList';
import { useAuth } from '../../hooks/useAuth';
import { appointmentService } from '@spartan-g/shared-services';
import type { AppointmentDocument } from '@spartan-g/shared-types';

export function StudentMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const { conversations, participantNames, isLoading, error, retry } = useConversationList();
  const [searchQuery, setSearchQuery] = useState('');
  const [appointments, setAppointments] = useState<(AppointmentDocument & { id: string })[]>([]);
  const { user } = useAuth();
  const requestedConversationId = searchParams.get('conversation');

  useEffect(() => {
    if (!requestedConversationId || activeConversationId) {
      return;
    }

    const exists = conversations.some((conversation) => conversation.id === requestedConversationId);
    if (exists) {
      setActiveConversationId(requestedConversationId);
      setSearchParams((currentParams) => {
        currentParams.delete('conversation');
        return currentParams;
      }, { replace: true });
    }
  }, [activeConversationId, conversations, requestedConversationId, setSearchParams]);

  useEffect(() => {
    if (activeConversationId && !conversations.some((conversation) => conversation.id === activeConversationId)) {
      setActiveConversationId(null);
    }
  }, [activeConversationId, conversations]);

  // Appointment context for the chat header (best effort; the header works without it).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    appointmentService
      .getStudentAppointments(user.uid, user.role)
      .then((data) => {
        if (!cancelled) setAppointments(data);
      })
      .catch((err) => console.error('Failed to load appointments for chat header:', err));
    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.role]);

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeParticipantId = activeConversation?.participantIds.find(id => id !== user?.uid);
  const activeName = activeParticipantId ? participantNames[activeParticipantId] : undefined;

  const appointmentContext = useMemo(() => {
    if (!activeParticipantId) return '';
    const toMs = (apt: AppointmentDocument) => {
      const ts: any = apt.scheduledAt;
      const date = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
      return date && !Number.isNaN(date.getTime()) ? (date as Date).getTime() : 0;
    };
    const describe = (label: string, apt: AppointmentDocument) => {
      const date = new Date(toMs(apt));
      return `${label}: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    };
    const mine = appointments.filter((a) => a.facilitatorId === activeParticipantId && toMs(a) > 0);
    const now = Date.now();
    const next = mine
      .filter((a) => a.status === 'accepted' && toMs(a) >= now)
      .sort((a, b) => toMs(a) - toMs(b))[0];
    if (next) return describe('Next appointment', next);
    const last = mine
      .filter((a) => a.status === 'completed' || a.status === 'accepted')
      .sort((a, b) => toMs(b) - toMs(a))[0];
    return last ? describe('Last appointment', last) : '';
  }, [appointments, activeParticipantId]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = useMemo(() => {
    if (!trimmedQuery) return conversations;
    return conversations.filter((conversation) => {
      const otherId = conversation.participantIds.find((id) => id !== user?.uid);
      const name = otherId ? participantNames[otherId] : '';
      return (name || '').toLowerCase().includes(trimmedQuery);
    });
  }, [conversations, participantNames, trimmedQuery, user?.uid]);

  const hasNoConversations = !isLoading && !error && conversations.length === 0;

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[480px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-card">
      {/* Conversation list (full width on mobile until a chat is opened) */}
      <div
        className={`${activeConversationId ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-[var(--color-border)] md:w-80 md:shrink-0`}
      >
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Messages</h2>
          {conversations.length > 0 && (
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              aria-label="Search chats"
              className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          )}
        </div>

        <div className="min-h-0 flex-1">
          {hasNoConversations ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <h3 className="mb-1 text-base font-semibold text-[var(--color-text)]">No conversations yet</h3>
              <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                Messaging becomes available after a facilitator accepts your appointment.
              </p>
              <a
                href="/student/facilitators"
                className="inline-flex rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[var(--color-primary-light)]"
              >
                Find a Facilitator
              </a>
            </div>
          ) : trimmedQuery && filteredConversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <h3 className="mb-1 text-base font-semibold text-[var(--color-text)]">No chats found</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">No chats match "{searchQuery.trim()}".</p>
            </div>
          ) : (
            <ConversationList
              conversations={filteredConversations}
              participantNames={participantNames}
              currentUserId={user?.uid}
              activeConversationId={activeConversationId || undefined}
              onSelectConversation={handleSelectConversation}
              isLoading={isLoading}
              error={error}
              onRetry={retry}
            />
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={`${activeConversationId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {activeConversationId && activeParticipantId ? (
          <>
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveConversationId(null)}
                aria-label="Back to conversations"
                className="rounded-full p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-alt)] md:hidden"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-sm font-semibold text-[var(--color-primary)]">
                {(activeName || 'F').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-[var(--color-text)]">
                  {activeName || 'Loading...'}
                </h3>
                <p className="truncate text-xs text-[var(--color-text-secondary)]">
                  Facilitator{appointmentContext ? ` · ${appointmentContext}` : ''}
                </p>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <MessageThread
                conversationId={activeConversationId}
                participantId={activeParticipantId}
              />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <svg
              className="mb-3 h-14 w-14 text-[var(--color-text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.6}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <h3 className="mb-1 text-lg font-semibold text-[var(--color-text)]">Your conversations</h3>
            <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
              Select a conversation to view your messages.
            </p>
            <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
              Messaging becomes available after a facilitator accepts your appointment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
