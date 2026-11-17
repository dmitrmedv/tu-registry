import type { ProcessingDto, TimelineEventDto } from '@tu-registry/shared';
import clsx from 'clsx';
import { formatCalendarDate, workingDaysLabel } from '@/shared/lib/format';
import { Badge, IconButton } from '@/shared/ui';
import styles from './processing.module.scss';

const TITLES: Record<TimelineEventDto['type'], string> = {
  REGISTERED: 'Заява',
  RESPONSE: 'Відповідь',
  DOCUMENTS_RECEIVED: 'Документи надійшли',
  TECHNICAL_CONDITIONS: 'Технічні умови',
};

type Props = {
  events: ProcessingDto['events'];
  /** No overdue warnings for applications registered before deadlines were tracked. */
  tracked: boolean;
  onOpenScan: (event: TimelineEventDto) => void;
};

/** What happened, in the order it happened: registration, responses, documents, TU. */
export function ProcessingTimeline({ events, tracked, onOpenScan }: Props) {
  return (
    <ol className={styles.timeline}>
      {events.map((event, index) => {
        const title = `${TITLES[event.type]}${event.number ? ` № ${event.number}` : ''}`;
        return (
          <li
            key={`${event.type}-${event.documentId ?? 'application'}-${index}`}
            className={clsx(styles.event, event.cancelled && styles.cancelled)}
            aria-label={`${title}, ${formatCalendarDate(event.date)}`}
          >
            <p className={styles.eventTitle}>
              <span>{title}</span>
              <span>від {formatCalendarDate(event.date)}</span>
              {event.cancelled && <Badge tone="danger">скасовано</Badge>}
            </p>
            <div className={styles.facts}>
              {event.person && (
                <span>
                  {event.type === 'REGISTERED' ? 'Зареєстрував(ла)' : 'Інженер'}: {event.person}
                </span>
              )}
              {event.type !== 'REGISTERED' && (
                <span>
                  {event.norm
                    ? `${workingDaysLabel(event.workingDays)} з ${event.norm}`
                    : `${workingDaysLabel(event.workingDays)} від реєстрації`}
                  {event.sinceDocumentsReceived !== null &&
                    ` (${workingDaysLabel(event.sinceDocumentsReceived)} від надходження документів)`}
                </span>
              )}
              {tracked && !event.cancelled && event.overdueBy > 0 && (
                <Badge tone="danger">строк перевищено на {workingDaysLabel(event.overdueBy)}</Badge>
              )}
              {event.scanName && (
                <IconButton
                  icon="eye"
                  label={`Скан: ${title}`}
                  title={event.scanName}
                  onClick={() => onOpenScan(event)}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
