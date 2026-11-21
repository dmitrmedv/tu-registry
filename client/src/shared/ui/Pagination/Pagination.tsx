import { IconButton } from '../IconButton';
import styles from './Pagination.module.scss';

type Props = { page: number; totalPages: number; onChange: (page: number) => void };

export function Pagination({ page, totalPages, onChange }: Props) {
  return (
    <nav className={styles.pagination} aria-label="Сторінки">
      <IconButton
        icon="chevronLeft"
        label="Попередня сторінка"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      />
      <span className={styles.position} aria-current="page">
        Сторінка {page} з {totalPages}
      </span>
      <IconButton
        icon="chevronRight"
        label="Наступна сторінка"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      />
    </nav>
  );
}
