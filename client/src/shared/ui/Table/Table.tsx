import type { ReactNode } from 'react';
import styles from './Table.module.scss';

/** A table that scrolls horizontally inside its own container on narrow screens. */
export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
