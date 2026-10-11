import { MessageDocument } from '@spartan-g/shared-types';

interface MessageBubbleProps {
  message: MessageDocument & { id: string };
  isCurrentUser: boolean;
}

export function MessageBubble({ message, isCurrentUser }: MessageBubbleProps) {
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] px-4 py-2 sm:max-w-[70%] ${
          isCurrentUser
            ? 'rounded-2xl rounded-br-md bg-[var(--color-primary)] text-white'
            : 'rounded-2xl rounded-bl-md bg-[var(--color-bg-alt)] text-[var(--color-text)]'
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        <p
          className={`mt-1 text-right text-[11px] ${
            isCurrentUser ? 'text-white/70' : 'text-[var(--color-text-muted)]'
          }`}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
