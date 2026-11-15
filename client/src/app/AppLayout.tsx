import clsx from 'clsx';
import { DEPARTMENT_NAMES } from '@tu-registry/shared';
import { useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router';
import { CHANGE_PASSWORD_PATH, useAuth, useCurrentUser } from '@/features/auth';
import { ROLE_LABELS } from '@/shared/lib/labels';
import { type MenuItem, MenuButton } from '@/shared/ui';
import styles from './AppLayout.module.scss';

const navClass = ({ isActive }: { isActive: boolean }) =>
  clsx(styles.navLink, isActive && styles.navLinkActive);

/**
 * Publishes the header's height as --app-header-height, so other sticky blocks (registry
 * filters) can sit right under it. The height changes when the header wraps.
 */
function useHeaderHeightVariable() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = ref.current;
    if (!header || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() =>
      root.style.setProperty('--app-header-height', `${header.offsetHeight}px`),
    );
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--app-header-height');
    };
  }, []);
  return ref;
}

export function AppLayout() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  // Until the temporary password is replaced, only the password page is reachable.
  const restricted = user.mustChangePassword;
  const headerRef = useHeaderHeightVariable();

  const settings: MenuItem[] = [
    ...(!restricted && user.role === 'ADMIN'
      ? [
          { label: 'Користувачі', to: '/users' },
          { label: 'Журнал', to: '/audit' },
        ]
      : []),
    ...(!restricted ? [{ label: 'Змінити пароль', to: CHANGE_PASSWORD_PATH }] : []),
    {
      label: 'Вийти',
      // The route guard then sends the visitor to the login page.
      onSelect: () => void logout().catch(() => undefined),
    },
  ];

  return (
    <div className={styles.shell}>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.inner}>
          <div className={styles.identity}>
            <p className={styles.userLine}>
              <span className={styles.userName}>{user.fullName}</span> — {ROLE_LABELS[user.role]}
            </p>
            <p className={styles.department}>{DEPARTMENT_NAMES[user.department]} управління</p>
          </div>
          <div className={styles.navRow}>
            {!restricted && (
              <nav aria-label="Основна навігація">
                <NavLink to="/" end className={navClass}>
                  Реєстр заяв на ТУ
                </NavLink>
              </nav>
            )}
            <MenuButton label="Налаштування" items={settings} />
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
