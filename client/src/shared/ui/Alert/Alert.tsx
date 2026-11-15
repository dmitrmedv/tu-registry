import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './Alert.module.scss';

type Props = { variant?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode };

export function Alert({ variant = 'info', children }: Props) {
  // Errors interrupt screen readers; other messages are announced politely.
  return (
    <div
      className={clsx(styles.alert, styles[variant])}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
