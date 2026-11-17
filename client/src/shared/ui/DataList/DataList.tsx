import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './DataList.module.scss';

type Props = {
  children: ReactNode;
  /**
   * `auto`: the label column as wide as the longest label (small frames, e.g. a response).
   * `fixed`: the same label column in every list of a tab, longer labels wrap (agreed
   * 2026-11-17 for «Заява» and «ТУ»), so lists side by side and one under another line up.
   */
  labels?: 'auto' | 'fixed';
};

/** Label–value rows of a card tab: the label muted on the left, the value bold on the right. */
export function DataList({ children, labels = 'auto' }: Props) {
  return <dl className={clsx(styles.list, labels === 'fixed' && styles.fixed)}>{children}</dl>;
}

/** One row; an empty value shows as a dash. */
export function DataRow({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{children === null || children === undefined || children === '' ? '—' : children}</dd>
    </div>
  );
}
