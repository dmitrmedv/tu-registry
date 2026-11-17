import type { ApplicationDto, TimelineEventDto } from '@tu-registry/shared';
import { type ReactNode, useId } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { Alert, Button, Spinner } from '@/shared/ui';
import styles from './processing.module.scss';
import { ProcessingTimeline } from './ProcessingTimeline';
import { useProcessing } from './queries';

type Props = {
  app: ApplicationDto;
  /** Opens the event's document in the card. */
  onSelectEvent?: (event: TimelineEventDto) => void;
  /** Centred above the title (e.g. «Історія змін»). */
  toolbar?: ReactNode;
};

/** «Історія опрацювання» of the card: the documents of the application, in the order made. */
export function ProcessingSection({ app, onSelectEvent, toolbar }: Props) {
  const processing = useProcessing(app.id);
  const titleId = useId();

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
      <h2 id={titleId} className={styles.heading}>
        Історія опрацювання
      </h2>
      {processing.isPending ? (
        <Spinner label="Завантаження історії опрацювання…" />
      ) : processing.isError ? (
        <Alert variant="error">
          {toApiError(processing.error).message}{' '}
          <Button size="sm" onClick={() => processing.refetch()}>
            Повторити
          </Button>
        </Alert>
      ) : (
        <ProcessingTimeline events={processing.data.events} onSelect={onSelectEvent} />
      )}
    </section>
  );
}
