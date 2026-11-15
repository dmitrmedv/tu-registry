import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './Dialog.module.scss';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Modal built on the native <dialog>: the browser traps focus and renders the backdrop.
 * React state is the only source of truth for `open`: Esc is intercepted (`cancel`) and
 * reported via onClose, and the native `close` event is ignored, because it also fires on
 * programmatic closing and would overwrite whatever state the parent has just set.
 * A backdrop click does not close it, to avoid losing form input.
 */
export function Dialog({ open, title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </>
      )}
    </dialog>
  );
}
