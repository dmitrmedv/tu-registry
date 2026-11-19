import clsx from 'clsx';
import { NavLink, Outlet } from 'react-router';
import { CHANGE_PASSWORD_PATH, useAuth, useCurrentUser } from '@/features/auth';
import { useDepartments } from '@/features/departments';
import { useHeightVariable } from '@/shared/hooks/useHeightVariable';
import { ROLE_LABELS } from '@/shared/lib/labels';
import { type MenuItem, MenuButton } from '@/shared/ui';
import styles from './AppLayout.module.scss';

const navClass = ({ isActive }: { isActive: boolean }) =>
  clsx(styles.navLink, isActive && styles.navLinkActive);

export function AppLayout() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  // Until the temporary password is replaced, only the password page is reachable.
  const restricted = user.mustChangePassword;
  // Sticky blocks below the header (registry filters, the card's title) sit right under it.
  const headerRef = useHeightVariable<HTMLElement>('--app-header-height');
  const { nameOf } = useDepartments();

  const settings: MenuItem[] = [
    ...(!restricted && user.role === 'ADMIN'
      ? [
          { label: 'Користувачі', to: '/users' },
          { label: 'Журнал', to: '/audit' },
          { label: 'Управління', to: '/departments' },
          { label: 'Інженери', to: '/engineers' },
          { label: 'Календар', to: '/calendar' },
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
          {/* «Налаштування» opposite the user's name (2026-11-19). */}
          <div className={styles.topRow}>
            <div className={styles.identity}>
              <p className={styles.userLine}>
                <span className={styles.userName}>{user.fullName}</span> — {ROLE_LABELS[user.role]}
              </p>
              <p className={styles.department}>{nameOf(user.department)} управління</p>
            </div>
            <MenuButton label="Налаштування" items={settings} />
          </div>
          {!restricted && (
            <nav aria-label="Основна навігація" className={styles.navRow}>
              <NavLink to="/" end className={navClass}>
                Головна
              </NavLink>
            </nav>
          )}
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
