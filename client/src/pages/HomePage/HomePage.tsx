import styles from '../page.module.scss';

/** Temporary placeholder; replaced by the applications registry in stage 7. */
export function HomePage() {
  return (
    <section className={styles.wide}>
      <h1>Реєстр заяв</h1>
      <p className={styles.muted}>Таблиця заяв зʼявиться на наступних етапах.</p>
    </section>
  );
}
