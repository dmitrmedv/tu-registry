import type { ApplicationDto } from '@tu-registry/shared';
import { ResponseDialog } from '@/features/responses';
import { TechnicalConditionsDialog } from '@/features/technicalConditions';

export type AddDialogProps = {
  app: ApplicationDto;
  onClose: () => void;
  /** Saved: the message to show. */
  onAdded: (notice: string) => void;
};

/** «Додати модуль» → a module's first document: its own form, with the card's message. */
export function AddResponseDialog({ app, onClose, onAdded }: AddDialogProps) {
  return (
    <ResponseDialog
      app={app}
      onClose={onClose}
      onSaved={(saved) => onAdded(`Відповідь № ${saved.outgoingNumber} додано`)}
    />
  );
}

export function AddTechnicalConditionsDialog({ app, onClose, onAdded }: AddDialogProps) {
  return (
    <TechnicalConditionsDialog
      app={app}
      onClose={onClose}
      onSaved={(saved) => onAdded(`Технічні умови № ${saved.tuNumber} додано`)}
    />
  );
}
