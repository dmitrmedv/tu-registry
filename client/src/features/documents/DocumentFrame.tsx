import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useId } from 'react';
import styles from './documents.module.scss';

type Props = {
  /** Shown on the frame's top edge, like a fieldset's legend (agreed 2026-11-19). */
  title: string;
  /** A fuller name for screen readers, e.g. with the document's number. */
  label?: string;
  children: ReactNode;
  /** The bottom row: the scan on the left, the actions on the right. */
  footer?: ReactNode;
  /** A cancelled document's frame is red. */
  cancelled?: boolean;
};

/** A part of a tab in its own titled frame: «Технічні умови», «Оплата за технічні умови». */
export function DocumentFrame({ title, label, children, footer, cancelled = false }: Props) {
  const titleId = useId();
  return (
    <section
      aria-label={label}
      aria-labelledby={label ? undefined : titleId}
      className={clsx(styles.titledFrame, cancelled && styles.frameCancelled)}
    >
      <h3 id={titleId} className={styles.frameTitle}>
        {title}
      </h3>
      <div className={styles.titledFrameBody}>{children}</div>
      {footer && <div className={styles.frameFooter}>{footer}</div>}
    </section>
  );
}
