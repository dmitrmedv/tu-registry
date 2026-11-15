import clsx from 'clsx';
import type { Ref, SelectHTMLAttributes } from 'react';
import styles from './fields.module.scss';
import { useFieldIds } from './useFieldIds';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  hint?: string;
  ref?: Ref<HTMLSelectElement>;
};

export function SelectField({ label, options, error, hint, id, className, ref, ...rest }: Props) {
  const ids = useFieldIds(id, Boolean(hint), Boolean(error));
  return (
    <div className={clsx(styles.field, className)}>
      <label htmlFor={ids.controlId} className={styles.label}>
        {label}
      </label>
      <select
        id={ids.controlId}
        ref={ref}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
