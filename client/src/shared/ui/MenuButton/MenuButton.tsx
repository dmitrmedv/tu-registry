import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import styles from './MenuButton.module.scss';

export type MenuItem = { label: string; to: string } | { label: string; onSelect: () => void };

type Props = { label: string; items: MenuItem[] };

/**
 * A button that opens a list of links and actions (WAI-ARIA "menu button"): Enter, Space or
 * ↓ open it and focus the first item, ↑/↓/Home/End move between items, Esc closes it and
 * returns focus to the button. Tab, a click outside and a page change close it too.
 */
export function MenuButton({ label, items }: Props) {
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

  return (
    <div className={styles.wrapper}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {label}
        <span aria-hidden="true" className={styles.caret}>
          ▾
        </span>
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={styles.menu}
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
