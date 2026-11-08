/**
 * Pure helpers for the chat: delivery status, thread ordering and date separators.
 * No imports on purpose, so they can be unit-tested without a bundler.
 */

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/** Firestore Timestamp, Date, millis, or null while a server timestamp is still pending. */
type TimeLike = { toDate?: () => Date } | Date | number | null | undefined;

export function toDate(value: TimeLike): Date | null {
  if (value === null || value === undefined) return null;
  const date = typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : new Date(value as Date | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface StatusSource {
  status?: string;
  readBy?: string[];
  senderId?: string;
}

/**
 * Status of a message I sent. Messages saved before the status field existed have none,
 * so fall back to readBy: anyone besides the sender in readBy has read it.
 */
export function resolveDeliveryStatus(message: StatusSource): DeliveryStatus {
  // The recipient in readBy always means "read", even if an older client (e.g. a
  // not-yet-updated mobile build) marked it without writing the newer status field.
  const readByOthers = (message.readBy ?? []).some((uid) => uid !== message.senderId);
  if (readByOthers || message.status === 'read') return 'read';
  return message.status === 'delivered' ? 'delivered' : 'sent';
}

/**
 * Status of my last message as shown in the chat list. Uses the denormalized
 * lastMessageStatus; for older conversations, an unread count of 0 for the other
 * participant means they have opened it.
 */
export function resolveConversationStatus(
  conversation: {
    lastMessageStatus?: string;
    lastMessageSenderId?: string;
    participantIds: string[];
    unreadCount?: Record<string, number>;
  },
  currentUserId: string,
): DeliveryStatus | null {
  if (!conversation.lastMessageSenderId || conversation.lastMessageSenderId !== currentUserId) return null;
  const status = conversation.lastMessageStatus;
  if (status === 'sent' || status === 'delivered' || status === 'read') return status;
  const other = conversation.participantIds.find((id) => id !== currentUserId);
  return other && (conversation.unreadCount?.[other] ?? 0) === 0 ? 'read' : 'sent';
}

export function statusText(status: DeliveryStatus, readAt?: TimeLike): string {
  switch (status) {
    case 'sending': return 'Sending…';
    case 'failed': return 'Not sent';
    case 'sent': return 'Sent';
    case 'delivered': return 'Delivered';
    case 'read': {
      const at = toDate(readAt);
      return at ? `Read · ${formatClock(at)}` : 'Read';
    }
  }
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Yesterday", or "Nov 5, 2026". */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface ThreadMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt?: TimeLike;
  readBy?: string[];
  status?: string;
  readAt?: TimeLike;
}

export interface PendingMessage {
  tempId: string;
  body: string;
  state: 'sending' | 'failed';
  /** Set once the server confirmed the send, until the snapshot catches up. */
  serverId?: string;
  createdAtMs: number;
}

export type ThreadItem =
  | { kind: 'separator'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: ThreadMessage;
      own: boolean;
      status: DeliveryStatus | null;
      tempId?: string;
      /** True for the newest message I sent: it gets the text label under the bubble. */
      isLastOwn: boolean;
    };

/**
 * Oldest first. Server messages sort by createdAt (id breaks ties so equal timestamps
 * never reorder between renders); a message whose timestamp is still pending goes last.
 * Messages still being sent always sit at the end, in the order they were typed.
 */
export function buildThreadItems(
  messages: ThreadMessage[],
  pending: PendingMessage[],
  currentUserId: string | undefined,
  now: Date = new Date(),
): ThreadItem[] {
  const timeOf = (m: ThreadMessage) => toDate(m.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const sorted = [...messages].sort((a, b) => timeOf(a) - timeOf(b) || a.id.localeCompare(b.id));

  const serverIds = new Set(messages.map((m) => m.id));
  const entries: { message: ThreadMessage; date: Date | null; status: DeliveryStatus | null; tempId?: string }[] = [];

  for (const message of sorted) {
    entries.push({
      message,
      date: toDate(message.createdAt),
      status: message.senderId === currentUserId ? resolveDeliveryStatus(message) : null,
    });
  }
  for (const p of [...pending].sort((a, b) => a.createdAtMs - b.createdAtMs)) {
    if (p.serverId && serverIds.has(p.serverId)) continue; // the real message replaced it
    entries.push({
      message: { id: p.serverId ?? p.tempId, senderId: currentUserId ?? '', body: p.body, createdAt: p.createdAtMs },
      date: new Date(p.createdAtMs),
      status: p.serverId ? 'sent' : p.state,
      tempId: p.tempId,
    });
  }

  let lastOwn = -1;
  entries.forEach((entry, index) => {
    if (entry.message.senderId === currentUserId) lastOwn = index;
  });

  const items: ThreadItem[] = [];
  let previousDay: number | null = null;
  entries.forEach((entry, index) => {
    // A message with no usable time stays in the current day group.
    const date = entry.date ?? new Date(now);
    const day = startOfDay(date);
    if (day !== previousDay) {
      items.push({ kind: 'separator', key: `day-${day}`, label: formatDayLabel(date, now) });
      previousDay = day;
    }
    items.push({
      kind: 'message',
      key: entry.message.id,
      message: entry.message,
      own: entry.message.senderId === currentUserId,
      status: entry.status,
      tempId: entry.tempId,
      isLastOwn: index === lastOwn,
    });
  });
  return items;
}
