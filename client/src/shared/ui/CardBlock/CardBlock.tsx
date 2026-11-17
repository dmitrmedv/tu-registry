import clsx from 'clsx';
import { type ReactNode, useId } from 'react';
import styles from './CardBlock.module.scss';

type Props = {
  title: string;
  /** Next to the title: a count, a badge. */
  meta?: ReactNode;
  /** Icon buttons for the block, in its bottom right corner. */
  actions?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
  children: ReactNode;
};

/**
 * One block of the application card («Заява», «Відповіді», «Технічні умови» and the stages to
 * come): a title, the content, and its actions in the bottom right corner — always in the same
 * place, apart from the data.
 */
export function CardBlock({ title, meta, actions, tone = 'default', className, children }: Props) {
  const titleId = useId();
  return (
    <section
      className={clsx(styles.block, tone === 'danger' && styles.danger, className)}
      aria-labelledby={titleId}
    >
      <div className={styles.header}>
        <h2 id={titleId}>{title}</h2>
        {meta}
      </div>
      <div className={styles.body}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  );
}

type ItemProps = {
  /** The item's accessible name (e.g. «Відповідь № 125 від 16.03.2026»). */
  label: string;
  /** Cancelled documents stay, muted and struck through. */
  cancelled?: boolean;
  actions?: ReactNode;
  children: ReactNode;
};

/** One document inside a block, with its own actions in its bottom right corner. */
export function CardItem({ label, cancelled = false, actions, children }: ItemProps) {
  return (
    <li className={clsx(styles.item, cancelled && styles.cancelled)} aria-label={label}>
      {children}
      {actions && <div className={styles.actions}>{actions}</div>}
    </li>
  );
}

/** The list of a block's items. */
export function CardItems({ children }: { children: ReactNode }) {
  return <ol className={styles.items}>{children}</ol>;
}

type FooterProps = {
  /** The main action, labelled, on the left (e.g. «Відкрити скан»). */
  start?: ReactNode;
  /** Icon actions on the right. */
  actions?: ReactNode;
};

/**
 * The bottom row of a tab of the card: the main action on the left, the icon actions in the
 * bottom right corner — the same place in every tab, apart from the data.
 */
export function CardFooter({ start, actions }: FooterProps) {
  if (!start && !actions) return null;
  return (
    <div className={styles.footer}>
      {start}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
