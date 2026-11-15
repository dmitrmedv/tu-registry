import clsx from 'clsx';
import type { InputHTMLAttributes, Ref } from 'react';
import styles from './fields.module.scss';
import { useFieldIds } from './useFieldIds';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
};

export function CheckboxField({ label, hint, id, className, ref, ...rest }: Props) {
  const ids = useFieldIds(id, Boolean(hint), false);
  return (
    <div className={clsx(styles.field, className)}>
      <div className={styles.checkbox}>
        <input
          id={ids.controlId}
          ref={ref}
          type="checkbox"
          aria-describedby={ids.describedBy}
          {...rest}
        />
        <label htmlFor={ids.controlId}>{label}</label>
      </div>
      {hint && (
        <p id={ids.hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
