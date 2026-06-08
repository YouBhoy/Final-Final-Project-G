import type { CSSProperties } from 'react';

interface PlaceholderPageProps {
  title: string;
  portal?: string;
}

export function PlaceholderPage({ title, portal }: PlaceholderPageProps) {
  return (
    <div style={styles.container}>
      {portal && <p style={styles.portal}>{portal}</p>}
      <p style={styles.caption}>Route placeholder</p>
      <h1 style={styles.title}>{title}</h1>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: 8,
  },
  portal: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  caption: { fontSize: 14, color: '#94a3b8' },
  title: { fontSize: 24, fontWeight: 600, color: '#0f172a' },
};
