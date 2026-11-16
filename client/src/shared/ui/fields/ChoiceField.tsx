import clsx from 'clsx';
import type { InputHTMLAttributes, Ref } from 'react';
import styles from './fields.module.scss';
import { useFieldIds } from './useFieldIds';

type Option = { value: string; label: string };

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  legend: string;
  options: readonly Option[];
  error?: string;
  hint?: string;
  /** The chosen option, when the field is controlled (outside React Hook Form). */
  value?: string;
  ref?: Ref<HTMLInputElement>;
};

/**
 * One choice out of a few, shown as buttons with the option's name. Real radio inputs underneath:
 * arrow keys move the choice and screen readers announce "radio, 2 of 6". Spread
 * react-hook-form's register(...) into it like into any input.
 */
export function ChoiceField({
  legend,
  options,
  error,
  hint,
  value,
  id,
  className,
  ref,
  ...rest
}: Props) {
  const ids = useFieldIds(id, Boolean(hint), Boolean(error));
  return (
    <fieldset
      className={clsx(styles.field, styles.choice, className)}
      aria-describedby={ids.describedBy}
    >
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.choiceOptions}>
        {options.map((option) => (
          <label key={option.value} className={styles.choiceOption}>
            <input
              ref={ref}
              type="radio"
              value={option.value}
              checked={value === undefined ? undefined : option.value === value}
              aria-invalid={error ? true : undefined}
              {...rest}
            />
            <span>{option.label}</span>
          </label>
        ))}
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
    </fieldset>
  );
}
