import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Badge.module.scss';

type Props = { tone?: 'neutral' | 'info' | 'success' | 'danger'; children: ReactNode };

export function Badge({ tone = 'neutral', children }: Props) {
  return <span className={clsx(styles.badge, styles[tone])}>{children}</span>;
}
