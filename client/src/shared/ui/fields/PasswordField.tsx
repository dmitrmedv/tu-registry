import clsx from 'clsx';
import { useState } from 'react';
import styles from './fields.module.scss';
import type { TextFieldProps } from './TextField';
import { useFieldIds } from './useFieldIds';

export function PasswordField({ label, error, hint, id, className, ref, ...rest }: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  const ids = useFieldIds(id, Boolean(hint), Boolean(error));
  return (
    <div className={clsx(styles.field, className)}>
      <label htmlFor={ids.controlId} className={styles.label}>
        {label}
      </label>
      <div className={styles.passwordWrapper}>
        <input
          id={ids.controlId}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={styles.control}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          {...rest}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={visible}
          aria-controls={ids.controlId}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'Сховати' : 'Показати'}
        </button>
      </div>
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
