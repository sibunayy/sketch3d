import type { ComponentChildren } from 'preact';
import { Button } from './Button';
import { copy } from '../copy';

/** A panel that slides up from the bottom on small screens. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ComponentChildren }) {
  if (!open) return null;
  return (
    <div class="sheet" role="dialog" aria-modal="false">
      {children}
      <div style={{ marginTop: 'var(--s3)' }}>
        <Button label={copy.btnClose} onClick={onClose} />
      </div>
    </div>
  );
}
