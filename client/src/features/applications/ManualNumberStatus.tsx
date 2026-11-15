import {
  formatRegNumber,
  type NextNumberDto,
  regDateField,
  regSeqField,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { formatCalendarDate } from '@/shared/lib/format';
import styles from './ApplicationForm.module.scss';
import { useManualNumberCheck } from './queries';

type Props = {
  regDate: string;
  regSeq: string;
  next: NextNumberDto | undefined;
  /** When editing: the application itself does not count as holding its number. */
  excludeId?: string;
};

/**
 * Shows the full number the digits will become ("14" + 2024 → "14т/24") and whether it is
 * free in that year. Informational only: the server checks again when saving.
 */
export function ManualNumberStatus({ regDate, regSeq, next, excludeId }: Props) {
  const date = regDateField.safeParse(regDate);
  const seq = regSeqField.safeParse(regSeq);
  const year = date.success ? Number(date.data.slice(0, 4)) : null;
  const regNumber = year && seq.success ? formatRegNumber(year, seq.data) : null;

  // Ask the server only once the user pauses typing.
  const checked = useDebouncedValue(
    regNumber ? { regDate: date.data!, regSeq: seq.data!, excludeId } : null,
  );
  const check = useManualNumberCheck(checked);

  if (!year) {
    return <p className={styles.muted}>Рік номера визначається за датою реєстрації.</p>;
  }
  if (!regNumber) return null;

  const isCurrent = check.data?.regNumber === regNumber;
  const ahead = next && year === next.regYear && seq.data! >= next.regSeq;

  return (
    <div className={styles.numberStatus}>
      <p role="status" className={styles.numberLine}>
        Номер реєстрації: <strong>{regNumber}</strong>
        {isCurrent && check.data!.available && (
          <span className={clsx(styles.badge, styles.free)}> — вільний</span>
        )}
        {isCurrent && !check.data!.available && (
          <span className={clsx(styles.badge, styles.taken)}>
            {' '}
            — уже зайнятий
            {check.data!.takenOn && ` (заява від ${formatCalendarDate(check.data!.takenOn)})`}
          </span>
        )}
        {!isCurrent && check.isFetching && <span className={styles.muted}> — перевірка…</span>}
      </p>
      {ahead && (
        <p className={styles.muted}>
          Номер не менший за наступний автоматичний ({next.regNumber}) — автоматична нумерація
          пропустить його.
        </p>
      )}
    </div>
  );
}
