import type { HTMLAttributes } from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  name?: string | null;
  initials?: string;
  src?: string | null;
  size?: AvatarSize;
  shape?: 'circle' | 'tile';
}

function makeInitials(name?: string | null) {
  const words = (name || '?').trim().split(/[\s@._-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
}

/** Consistent identity mark: photo when available, otherwise white with maroon initials. */
export function Avatar({ name, initials, src, size = 'md', shape = 'circle', className = '', ...props }: AvatarProps) {
  return (
    <span
      className={`portal-avatar portal-avatar--${size} portal-avatar--${shape} ${className}`.trim()}
      aria-hidden={src ? undefined : true}
      aria-label={src ? undefined : name || initials || 'User'}
      {...props}
    >
      {src ? <img className="portal-avatar__image" src={src} alt={name || 'User'} /> : initials || makeInitials(name)}
    </span>
  );
}
