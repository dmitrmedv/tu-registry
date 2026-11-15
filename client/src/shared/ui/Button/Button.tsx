import clsx from 'clsx';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Spinner } from '../Spinner';
import styles from './Button.module.scss';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={clsx(styles.button, styles[variant], styles[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

/** Navigation that looks like a button (e.g. "Нова заява" in a page header). */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: LinkProps & { variant?: Props['variant']; size?: Props['size'] }) {
  return (
    <Link className={clsx(styles.button, styles[variant], styles[size], className)} {...rest} />
  );
}
