import type { CalendarDayDto } from '@tu-registry/shared';
import { formatCalendarDate, formatDateTime } from '@/shared/lib/format';
import { CALENDAR_DAY_KIND_LABELS } from '@/shared/lib/labels';
import { Badge, IconButton, Table } from '@/shared/ui';
import styles from './calendar.module.scss';
import { weekdayOf } from './weekday';

type Props = {
  days: CalendarDayDto[];
  onEdit: (day: CalendarDayDto) => void;
  onDelete: (day: CalendarDayDto) => void;
};

export function CalendarTable({ days, onEdit, onDelete }: Props) {
  return (
    <Table caption="Календар робочих днів">
      <thead>
        <tr>
          <th scope="col">Дата</th>
          <th scope="col">Тип</th>
          <th scope="col">Опис</th>
          <th scope="col">Змінив</th>
          <th scope="col">
            <span className="visually-hidden">Дії</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => {
          const date = formatCalendarDate(day.date);
          return (
            <tr key={day.date}>
              <td className={styles.date}>
                {date}, {weekdayOf(day.date)}
              </td>
              <td>
                {day.kind === 'NON_WORKING' ? (
                  <Badge>{CALENDAR_DAY_KIND_LABELS.NON_WORKING}</Badge>
                ) : (
                  CALENDAR_DAY_KIND_LABELS.WORKING
                )}
              </td>
              <td>{day.description}</td>
              <td>
                {day.updatedBy?.fullName ?? '—'}
                <br />
                <span className={styles.muted}>{formatDateTime(day.updatedAt)}</span>
              </td>
              <td>
                <div className={styles.actions}>
                  <IconButton
                    icon="pencil"
                    label={`Редагувати: ${date}`}
                    onClick={() => onEdit(day)}
                  />
                  <IconButton
                    icon="trash"
                    tone="danger"
                    label={`Видалити: ${date}`}
                    onClick={() => onDelete(day)}
                  />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
