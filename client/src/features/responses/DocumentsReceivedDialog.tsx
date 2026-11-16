import { kyivCalendarDate, type ResponseDto } from '@tu-registry/shared';
import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { Alert, Button, Dialog, TextField } from '@/shared/ui';
import { useUpdateResponse } from './queries';

type Props = { applicationId: string; response: ResponseDto; onClose: () => void };

/**
 * After a response the customer brings the missing documents: the date is recorded on that
 * response, and processing of the same application goes on. A date entered by mistake can be
 * changed or removed.
 */
export function DocumentsReceivedDialog({ applicationId, response, onClose }: Props) {
  const update = useUpdateResponse(applicationId);
  const [date, setDate] = useState(response.documentsReceivedAt ?? kyivCalendarDate());
  const [error, setError] = useState<string>();

  const save = async (documentsReceivedAt: string | null) => {
    setError(undefined);
    try {
      await update.mutateAsync({
        id: response.id,
        input: { version: response.version, documentsReceivedAt },
      });
      onClose();
    } catch (e) {
      const apiError = toApiError(e);
      const details = apiError.details as
        { fieldErrors?: Record<string, string[] | undefined> } | undefined;
      setError(details?.fieldErrors?.documentsReceivedAt?.[0] ?? apiError.message);
    }
  };

  return (
    <Dialog
      open
      title="Документи надійшли"
      onClose={onClose}
      footer={
        <>
          {response.documentsReceivedAt && (
            <Button onClick={() => save(null)} disabled={update.isPending}>
              Прибрати дату
            </Button>
          )}
          <Button onClick={onClose} disabled={update.isPending}>
            Скасувати
          </Button>
          <Button variant="primary" onClick={() => save(date)} loading={update.isPending}>
            Зберегти
          </Button>
        </>
      }
    >
      <p>
        Після відповіді № {response.outgoingNumber} від {formatCalendarDate(response.responseDate)}{' '}
        замовник подав відсутні або виправлені документи. Заява продовжує опрацьовуватися; відповідь
        лишається в історії.
      </p>
      <TextField
        label="Дата надходження документів"
        type="date"
        min={response.responseDate}
        max={kyivCalendarDate()}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      {error && <Alert variant="error">{error}</Alert>}
    </Dialog>
  );
}
