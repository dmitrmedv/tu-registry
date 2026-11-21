import { cancelDocumentSchema } from '@tu-registry/shared';
import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { Button, Dialog, TextAreaField } from '@/shared/ui';
import { notifyError } from '@/shared/lib/notify';

type Props = {
  title: string;
  /** Sends the reason; a rejection is shown in the dialog. */
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
  /** A contract is annulled, and only a new one replaces it (agreed 2026-11-20). */
  confirmLabel?: string;
  note?: string;
};

const NOTE =
  'Документ не видаляється: він лишиться в історії опрацювання закресленим, з причиною. ' +
  'Повернути його може адміністратор.';

/** Cancelling a response or technical conditions: they stay in history, struck through. */
export function CancelDocumentDialog({
  title,
  onConfirm,
  onClose,
  confirmLabel = 'Скасувати документ',
  note = NOTE,
}: Props) {
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const parsed = cancelDocumentSchema.shape.reason.safeParse(reason);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setPending(true);
    try {
      await onConfirm(parsed.data);
      onClose();
    } catch (e) {
      notifyError(toApiError(e).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      busy={pending}
      open
      title={title}
      onClose={onClose}
      footer={
        <Button variant="danger" onClick={submit} loading={pending}>
          {confirmLabel}
        </Button>
      }
    >
      <p>{note}</p>
      <TextAreaField
        label="Причина скасування"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={fieldError}
        autoFocus
      />
    </Dialog>
  );
}
