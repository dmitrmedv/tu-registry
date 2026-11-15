import clsx from 'clsx';
import type { InputHTMLAttributes, Ref } from 'react';
import styles from './fields.module.scss';
import { useFieldIds } from './useFieldIds';

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
};

export function TextField({ label, error, hint, id, className, ref, ...rest }: TextFieldProps) {
  const ids = useFieldIds(id, Boolean(hint), Boolean(error));
  return (
    <div className={clsx(styles.field, className)}>
      <label htmlFor={ids.controlId} className={styles.label}>
        {label}
      </label>
      <input
        id={ids.controlId}
        ref={ref}
        className={styles.control}
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
