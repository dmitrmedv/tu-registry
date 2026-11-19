import type { ApplicationDto } from '@tu-registry/shared';
import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { Button, Dialog, TextField } from '@/shared/ui';
import { useDeleteApplication } from './queries';
import { notifyError } from '@/shared/lib/notify';

type Props = { app: ApplicationDto; onClose: () => void; onDeleted: () => void };

/** Irreversible, so the administrator types the number to confirm which application goes. */
export function DeleteDialog({ app, onClose, onDeleted }: Props) {
  const remove = useDeleteApplication(app.id);
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim() === app.regNumber;

  const submit = async () => {
    if (!confirmed) return;
    try {
      await remove.mutateAsync(app.version);
      onDeleted();
    } catch (e) {
      notifyError(toApiError(e).message);
    }
  };

  return (
    <Dialog
      busy={remove.isPending}
      open
      title={`Видалити заяву ${app.regNumber}?`}
      onClose={onClose}
      footer={
        <Button variant="danger" onClick={submit} disabled={!confirmed} loading={remove.isPending}>
          Видалити назавжди
        </Button>
      }
    >
      <p>
        Заяву та всю історію її змін буде видалено без можливості відновлення. Номер {app.regNumber}{' '}
        стане вільним для ручного внесення. У журналі аудиту лишиться запис про видалення.
      </p>
      <TextField
        label={`Введіть номер ${app.regNumber} для підтвердження`}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        autoFocus
      />
    </Dialog>
  );
}
