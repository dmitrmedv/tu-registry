import clsx from 'clsx';
import type { InputHTMLAttributes, Ref } from 'react';
import styles from './fields.module.scss';
import { useFieldIds } from './useFieldIds';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  hint?: string;
  /** "switch" toggles a mode on/off; announced as a switch by screen readers. */
  variant?: 'checkbox' | 'switch';
  ref?: Ref<HTMLInputElement>;
};

export function CheckboxField({
  label,
  hint,
  variant = 'checkbox',
  id,
  className,
  ref,
  ...rest
}: Props) {
  const ids = useFieldIds(id, Boolean(hint), false);
  return (
    <div className={clsx(styles.field, className)}>
      <div className={clsx(styles.checkbox, variant === 'switch' && styles.switch)}>
        <input
          id={ids.controlId}
          ref={ref}
          type="checkbox"
          role={variant === 'switch' ? 'switch' : undefined}
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
