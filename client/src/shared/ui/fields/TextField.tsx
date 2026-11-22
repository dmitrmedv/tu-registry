import clsx from 'clsx';
import type { InputHTMLAttributes, Ref } from 'react';
import styles from './fields.module.scss';
import { useFieldIds } from './useFieldIds';

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  /** A sum: aligned to the right, figures of one width, so the sums read easier. */
  amount?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function TextField({
  label,
  error,
  hint,
  amount,
  id,
  className,
  ref,
  ...rest
}: TextFieldProps) {
  const ids = useFieldIds(id, Boolean(hint), Boolean(error));
  return (
    <div className={clsx(styles.field, className)}>
      <label htmlFor={ids.controlId} className={styles.label}>
        {label}
      </label>
      <input
        id={ids.controlId}
        ref={ref}
        className={clsx(styles.control, amount && styles.amount)}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...rest}
      />
      {hint && (
        <p id={ids.hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
