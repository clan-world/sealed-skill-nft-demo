import type { ReactNode } from 'react';

export function MonoLabel(props: { label: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline' }}>
      <strong>{props.label}</strong>
      <code>{props.children}</code>
    </span>
  );
}
