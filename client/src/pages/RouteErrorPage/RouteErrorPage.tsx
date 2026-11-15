import { Button } from '@/shared/ui';
import styles from '../page.module.scss';

/** Rendered by the router when a page throws while rendering. */
export function RouteErrorPage() {
  return (
    <main className={styles.standalone}>
      <h1>Щось пішло не так</h1>
      <p className={styles.muted}>Сталася помилка під час відображення сторінки.</p>
      <div>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Оновити сторінку
        </Button>
      </div>
    </main>
  );
}
