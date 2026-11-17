import { Dialog } from '@/shared/ui';
import { ApplicationHistory } from './ApplicationHistory';

/** «Історія змін» in a dialog: loaded only when opened, so the card stays light. */
export function HistoryDialog({
  applicationId,
  onClose,
}: {
  applicationId: string;
  onClose: () => void;
}) {
  return (
    <Dialog open title="Історія змін" onClose={onClose}>
      <ApplicationHistory applicationId={applicationId} />
    </Dialog>
  );
}
