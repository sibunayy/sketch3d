import type { ComponentChildren } from 'preact';

/** A titled box that groups related controls. */
export function Panel({ title, children }: { title?: string; children: ComponentChildren }) {
  return (
    <section class="panel">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
