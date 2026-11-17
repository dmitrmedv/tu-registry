import type { ApplicationDto, TimelineEventDto } from '@tu-registry/shared';
import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { openPdf } from '@/shared/lib/pdf';
import { Alert, Button, CardBlock, Spinner } from '@/shared/ui';
import { processingApi } from './api';
import { DeadlineSummary } from './DeadlineSummary';
import { ProcessingTimeline } from './ProcessingTimeline';
import { useProcessing } from './queries';

/** «Історія опрацювання» of the card: the deadlines and the timeline of the documents. */
export function ProcessingSection({ app }: { app: ApplicationDto }) {
  const processing = useProcessing(app.id);
  const [scanError, setScanError] = useState<string>();

  const openScan = async (event: TimelineEventDto) => {
    setScanError(undefined);
    try {
      await openPdf(() => processingApi.scanOf(app.id, event), event.scanName ?? '');
    } catch (e) {
      setScanError(`Не вдалося відкрити скан: ${toApiError(e).message}`);
    }
  };

  return (
    <CardBlock title="Історія опрацювання">
      {scanError && <Alert variant="error">{scanError}</Alert>}
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
        <>
          {/* An annulled application is not being processed: its deadlines do not run. */}
          {app.status === 'ACTIVE' && <DeadlineSummary deadlines={processing.data.deadlines} />}
          <ProcessingTimeline
            events={processing.data.events}
            tracked={processing.data.deadlines.tracked}
            onOpenScan={openScan}
          />
        </>
      )}
    </CardBlock>
  );
}
