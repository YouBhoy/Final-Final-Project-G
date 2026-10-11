import { useState } from 'react';

interface MessageInputProps {
  /** Return `false` (or reject) to keep the typed text, e.g. when sending failed. */
  onSend: (body: string) => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  disabled = false,
  isSending = false,
  placeholder = 'Type a message...',
}: MessageInputProps) {
  const [body, setBody] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || disabled) return;

    try {
      const result = await onSend(trimmed);
      if (result !== false) setBody('');
    } catch {
      // Keep the text so the user can retry.
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 border-t border-[var(--color-border)] p-3 sm:p-4"
    >
      <input
        type="text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message"
        className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-alt)]"
      />
      <button
        type="submit"
        disabled={disabled || !body.trim()}
        className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[var(--color-primary-light)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSending ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
