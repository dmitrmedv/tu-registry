import clsx from 'clsx';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from '../Icon';
import { Spinner } from '../Spinner';
import styles from './IconButton.module.scss';

type Common = {
  icon: IconName;
  /** The action's name: read by screen readers and shown on hover. */
  label: string;
  /** Danger: actions that annul, cancel or delete (they still ask for confirmation). */
  tone?: 'default' | 'danger';
};

type ButtonProps = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
    loading?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

/** A button with an icon only, for the action rows of the card blocks. */
export function IconButton({
  icon,
  label,
  tone = 'default',
  loading = false,
  type = 'button',
  disabled,
  className,
  title,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={clsx(styles.iconButton, styles[tone], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : <Icon name={icon} />}
    </button>
  );
}

/** The same look for navigation (e.g. «Редагувати» opens the edit page). */
export function IconLink({
  icon,
  label,
  tone = 'default',
  className,
  ...rest
}: Common & Omit<LinkProps, 'children' | 'aria-label'>) {
  return (
    <Link
      aria-label={label}
      title={label}
      className={clsx(styles.iconButton, styles[tone], className)}
      {...rest}
    >
      <Icon name={icon} />
    </Link>
  );
}
