import clsx from 'clsx';
import type { Ref, TextareaHTMLAttributes } from 'react';
import styles from './fields.module.scss';
import { useFieldIds } from './useFieldIds';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

export function TextAreaField({ label, error, hint, id, className, ref, ...rest }: Props) {
  const ids = useFieldIds(id, Boolean(hint), Boolean(error));
  return (
    <div className={clsx(styles.field, className)}>
      <label htmlFor={ids.controlId} className={styles.label}>
        {label}
      </label>
      <textarea
        id={ids.controlId}
        ref={ref}
        rows={3}
        className={clsx(styles.control, styles.textarea)}
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
