import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react';
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
 * A click on the backdrop closes it like Esc does (reported via onClose) — but only a click
 * that also started there: selecting text in a field and releasing outside keeps it open.
 */
export function Dialog({ open, title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedOnBackdrop = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();

    return () => {
      // Runs both when `open` turns false and when the parent unmounts the dialog. Either way
      // React has already removed the focused content, so the browser no longer sees focus
      // inside the dialog and does not return it to the opener by itself.
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, [open]);

  // The backdrop belongs to the <dialog> element itself: a press on it targets the element,
  // outside its box (a press on its scrollbar targets it too, but inside the box).
  const isOnBackdrop = (event: MouseEvent | PointerEvent) => {
    const dialog = ref.current;
    if (!dialog || event.target !== dialog) return false;
    const box = dialog.getBoundingClientRect();
    return (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    );
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = isOnBackdrop(event);
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && isOnBackdrop(event)) onClose();
        pressedOnBackdrop.current = false;
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
