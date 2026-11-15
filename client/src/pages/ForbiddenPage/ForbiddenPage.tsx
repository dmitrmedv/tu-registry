import { Link } from 'react-router';
import styles from '../page.module.scss';

export function ForbiddenPage() {
  return (
    <section className={styles.narrow}>
      <h1>Недостатньо прав</h1>
      <p className={styles.muted}>Цей розділ доступний лише адміністраторам.</p>
      <Link to="/">Повернутися до реєстру</Link>
    </section>
  );
}
