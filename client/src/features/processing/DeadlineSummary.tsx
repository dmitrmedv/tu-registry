import type { DeadlineDto, ProcessingDto } from '@tu-registry/shared';
import { formatCalendarDate, pluralUk, workingDaysLabel } from '@/shared/lib/format';
import { Badge } from '@/shared/ui';
import styles from './processing.module.scss';

/** "4 робочі дні з 5" once done; "минуло 3 з 5, лишилось 2 (до 09.11.2026)" while awaited. */
function DeadlineLine({
  label,
  deadline,
  tracked,
}: {
  label: string;
  deadline: DeadlineDto;
  tracked: boolean;
}) {
  const { used, norm, remaining, dueDate, overdueBy, done } = deadline;
  return (
    <li>
      <span className={styles.term}>{label}:</span>{' '}
      {done
        ? `${workingDaysLabel(used)} з ${norm}`
        : remaining > 0
          ? `минуло ${used} з ${norm} ${pluralUk(norm, ['робочого дня', 'робочих днів', 'робочих днів'])}, ${pluralUk(remaining, ['лишився', 'лишилось', 'лишилось'])} ${remaining} (до ${formatCalendarDate(dueDate)})`
          : remaining === 0
            ? `минуло ${used} з ${norm}, сьогодні останній день`
            : `минуло ${used} з ${norm}`}{' '}
      {tracked && overdueBy > 0 && (
        <Badge tone="danger">Строк перевищено на {workingDaysLabel(overdueBy)}</Badge>
      )}
      {tracked && done && overdueBy === 0 && <Badge tone="success">вчасно</Badge>}
    </li>
  );
}

/** The deadlines of the application at a glance, counted by the server. */
export function DeadlineSummary({ deadlines }: { deadlines: ProcessingDto['deadlines'] }) {
  return (
    <ul className={styles.summary} aria-label="Строки опрацювання">
      {deadlines.response && (
        <DeadlineLine label="Відповідь" deadline={deadlines.response} tracked={deadlines.tracked} />
      )}
      <DeadlineLine label="Технічні умови" deadline={deadlines.tu} tracked={deadlines.tracked} />
      {!deadlines.tracked && (
        <li className={styles.muted}>
          Строки не контролюються: заяву зареєстровано до запуску модуля опрацювання.
        </li>
      )}
    </ul>
  );
}
