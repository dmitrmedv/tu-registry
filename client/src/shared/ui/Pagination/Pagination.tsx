import { Button } from '../Button';
import styles from './Pagination.module.scss';

type Props = { page: number; totalPages: number; onChange: (page: number) => void };

export function Pagination({ page, totalPages, onChange }: Props) {
  return (
    <nav className={styles.pagination} aria-label="Сторінки">
      <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Попередня
      </Button>
      <span className={styles.position} aria-current="page">
        Сторінка {page} з {totalPages}
      </span>
      <Button size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Наступна ›
      </Button>
    </nav>
  );
}
