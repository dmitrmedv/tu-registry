import { Link } from 'react-router';
import styles from '../page.module.scss';

export function NotFoundPage() {
  return (
    <main className={styles.standalone}>
      <h1>Сторінку не знайдено</h1>
      <Link to="/">Повернутися до реєстру</Link>
    </main>
  );
}
