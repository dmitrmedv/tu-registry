import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { CHANGE_PASSWORD_PATH, useAuth, useCurrentUser } from '@/features/auth';
import { ROLE_LABELS } from '@/shared/lib/labels';
import { Badge, Button } from '@/shared/ui';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // Until the temporary password is replaced, only the password page is reachable.
  const restricted = user.mustChangePassword;
  const closeMenu = () => setMenuOpen(false);
  const headerRef = useHeaderHeightVariable();

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout().catch(() => undefined);
  };

  return (
    <div className={styles.shell}>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.bar}>
          <Link to="/" className={styles.brand} onClick={closeMenu}>
            Реєстр заяв на ТУ
          </Link>
          <button
            type="button"
            className={styles.menuToggle}
            aria-expanded={menuOpen}
            aria-controls="main-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Меню
          </button>
          <div id="main-menu" className={clsx(styles.menu, menuOpen && styles.menuOpen)}>
            {/* "Нова заява" lives on the registry page; the header keeps admin sections only. */}
            {!restricted && user.role === 'ADMIN' && (
              <nav aria-label="Основна навігація" className={styles.nav}>
                <NavLink to="/users" className={navClass} onClick={closeMenu}>
                  Користувачі
                </NavLink>
                <NavLink to="/audit" className={navClass} onClick={closeMenu}>
                  Журнал
                </NavLink>
              </nav>
            )}
            <div className={styles.account}>
              <span className={styles.userName}>{user.fullName}</span>
              <Badge tone={user.role === 'ADMIN' ? 'info' : 'neutral'}>
                {ROLE_LABELS[user.role]}
              </Badge>
              {!restricted && (
                <NavLink to={CHANGE_PASSWORD_PATH} className={navClass} onClick={closeMenu}>
                  Змінити пароль
                </NavLink>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout} loading={loggingOut}>
                Вийти
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
