import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Button, IconButton } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}

/**
 * Native modal <dialog>: the browser provides focus containment, inert background,
 * Escape to close and focus restoration to the opener.
 */
export function Dialog({ open, onClose, title, description, children, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's autoFocus runs before the dialog is shown, so focus the first field explicitly
      // (falling back to the browser default: the first focusable element).
      dialog.querySelector<HTMLElement>('.dialog-body input, .dialog-body textarea, .dialog-body select')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Report only genuine closes. Ignore (a) closes we triggered ourselves (open → false) and (b) a stale,
      // asynchronously dispatched "close" event arriving after the dialog was already reopened.
      onClose={() => openRef.current && !ref.current?.open && onClose()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself, outside its content) closes it.
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog-body">
          <header className="dialog-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && (
                <p id={descriptionId} className="muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close dialog" onClick={onClose}>
              <X size={16} aria-hidden />
            </IconButton>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, pending, error, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm">
      <p className="dialog-message">{message}</p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
