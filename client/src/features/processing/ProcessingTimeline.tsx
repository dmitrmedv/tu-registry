import { formatMonth, type ProcessingDto, type TimelineEventDto } from '@tu-registry/shared';
import clsx from 'clsx';
import { formatCalendarDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui';
import styles from './processing.module.scss';

const TITLES: Record<TimelineEventDto['type'], string> = {
  REGISTERED: 'Заява',
  RESPONSE: 'Відповідь',
  DOCUMENTS_RECEIVED: 'Документи надійшли',
  TECHNICAL_CONDITIONS: 'Технічні умови',
  TU_INVOICE: 'Рахунок за ТУ',
  TU_PAID: 'Оплата за ТУ',
  TU_ACT_TRANSFERRED: 'Акт передано в бухгалтерію',
};

type Props = {
  events: ProcessingDto['events'];
  /** Opens the event's document in the card. */
  onSelect?: (event: TimelineEventDto) => void;
};

/** What happened, in the order it happened: a document and its date per line. */
export function ProcessingTimeline({ events, onSelect }: Props) {
  return (
    <ol className={styles.timeline}>
      {events.map((event, index) => {
        const title = `${TITLES[event.type]}${event.number ? ` № ${event.number}` : ''}`;
        // The act goes to accounting in a month, not on a day: the month is all there is to show.
        const when = event.month ? formatMonth(event.month) : formatCalendarDate(event.date);
        const date = event.month ? when : `від ${when}`;
        const text = (
          <>
            <span className={styles.eventName}>{title}</span> <span>{date}</span>
          </>
        );
        return (
          <li
            key={`${event.type}-${event.documentId ?? 'application'}-${index}`}
            className={clsx(styles.event, event.cancelled && styles.cancelled)}
            aria-label={`${title}, ${when}`}
          >
            {onSelect ? (
              <button
                type="button"
                className={styles.eventLink}
                title="Відкрити у картці"
                onClick={() => onSelect(event)}
              >
                {text}
              </button>
            ) : (
              <p className={styles.eventText}>{text}</p>
            )}
            {event.cancelled && <Badge tone="danger">скасовано</Badge>}
          </li>
        );
      })}
    </ol>
  );
}
