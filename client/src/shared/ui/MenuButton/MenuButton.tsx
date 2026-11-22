import clsx from 'clsx';
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { IconName } from '../Icon';
import { IconButton } from '../IconButton';
import styles from './MenuButton.module.scss';

export type MenuItem = { label: string; to: string } | { label: string; onSelect: () => void };

type Props = {
  label: string;
  items: MenuItem[];
  /** An icon button instead of the label (its name is then read and shown on hover). */
  icon?: IconName;
  /** Where the list lines up with the button: its right edge (default) or its left one. */
  align?: 'start' | 'end';
};

/**
 * A button that opens a list of links and actions (WAI-ARIA "menu button"): Enter, Space or
 * ↓ open it and focus the first item, ↑/↓/Home/End move between items, Esc closes it and
 * returns focus to the button. Tab, a click outside and a page change close it too.
 */
export function MenuButton({ label, items, icon, align = 'end' }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const { pathname } = useLocation();

  const itemElements = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const close = ({ returnFocus = false } = {}) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // Up from the button when there is no room under it on the screen, so the list never makes
  // the page longer (2026-11-23). Before the first item takes focus: that would scroll to it.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!open || !menu || !button) return;
    const { top, bottom } = button.getBoundingClientRect();
    const height = menu.offsetHeight + 8;
    const roomBelow = document.documentElement.clientHeight - bottom;
    menu.dataset.side = roomBelow < height && top > roomBelow ? 'top' : 'bottom';
  }, [open]);

  // The first item takes focus as the menu opens.
  useEffect(() => {
    if (open) itemElements()[0]?.focus();
  }, [open]);

  // Following a link closes the menu.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const elements = itemElements();
    const current = elements.indexOf(document.activeElement as HTMLElement);
    const focusAt = (index: number) =>
      elements[(index + elements.length) % elements.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        return focusAt(current + 1);
      case 'ArrowUp':
        event.preventDefault();
        return focusAt(current - 1);
      case 'Home':
        event.preventDefault();
        return focusAt(0);
      case 'End':
        event.preventDefault();
        return focusAt(elements.length - 1);
      case 'Escape':
        event.preventDefault();
        return close({ returnFocus: true });
      case 'Tab':
        return close();
    }
  };

  const triggerProps = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': menuId,
    onClick: () => setOpen((value) => !value),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setOpen(true);
      }
    },
  };

  return (
    <div className={styles.wrapper}>
      {icon ? (
        <IconButton ref={buttonRef} icon={icon} label={label} {...triggerProps} />
      ) : (
        <button ref={buttonRef} type="button" className={styles.button} {...triggerProps}>
          {label}
          <span aria-hidden="true" className={styles.caret}>
            ▾
          </span>
        </button>
      )}
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={clsx(styles.menu, align === 'start' && styles.start, icon && styles.compact)}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              {'to' in item ? (
                <Link to={item.to} role="menuitem" tabIndex={-1} className={styles.item}>
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={styles.item}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
