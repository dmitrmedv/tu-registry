import styles from './HomePage.module.scss';

/** Temporary placeholder; replaced by the applications registry in stage 7. */
export function HomePage() {
  return (
    <main className={styles.page}>
      <h1>Реєстр заяв на технічні умови</h1>
      <p className={styles.muted}>
        Каркас застосунку готовий. Функціональність з'явиться на наступних етапах.
      </p>
    </main>
  );
}
