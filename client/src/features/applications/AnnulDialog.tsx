import { annulApplicationSchema, type ApplicationDto } from '@tu-registry/shared';
import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { Alert, Button, Dialog, TextAreaField } from '@/shared/ui';
import { useAnnulApplication } from './queries';

type Props = { app: ApplicationDto; onClose: () => void };

export function AnnulDialog({ app, onClose }: Props) {
  const annul = useAnnulApplication(app.id);
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();

  const submit = async () => {
    const parsed = annulApplicationSchema.shape.reason.safeParse(reason);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    try {
      await annul.mutateAsync({ reason: parsed.data, version: app.version });
      onClose();
    } catch (e) {
      setError(toApiError(e).message);
    }
  };

  return (
    <Dialog
      open
      title={`Анулювати заяву ${app.regNumber}?`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={annul.isPending}>
            Скасувати
          </Button>
          <Button variant="danger" onClick={submit} loading={annul.isPending}>
            Анулювати
          </Button>
        </>
      }
    >
      <p>
        Заява лишиться в реєстрі з позначкою «Анульовано», а номер {app.regNumber} — зайнятим.
        Редагувати анульовану заяву не можна; відновити її може адміністратор.
      </p>
      <TextAreaField
        label="Причина анулювання"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={fieldError}
        autoFocus
      />
      {error && <Alert variant="error">{error}</Alert>}
    </Dialog>
  );
}
