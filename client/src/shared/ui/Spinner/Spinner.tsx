import clsx from 'clsx';
import styles from './Spinner.module.scss';

/** Decorative by default; pass `label` when the spinner is the only content. */
export function Spinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  return (
    <span className={styles.wrapper} role={label ? 'status' : undefined}>
      <span className={clsx(styles.spinner, styles[size])} aria-hidden="true" />
      {label && <span className="visually-hidden">{label}</span>}
    </span>
  );
}

export function FullPageSpinner() {
  return (
    <div className={styles.fullPage}>
      <Spinner size="lg" label="Завантаження…" />
    </div>
  );
}
