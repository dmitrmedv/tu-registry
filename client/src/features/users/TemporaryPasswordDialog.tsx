import type { UserWithTemporaryPassword } from '@tu-registry/shared';
import { useState } from 'react';
import { notifySuccess } from '@/shared/lib/notify';
import { Alert, Button, Dialog } from '@/shared/ui';
import styles from './users.module.scss';

type Props = {
  result: UserWithTemporaryPassword;
  reason: 'created' | 'reset';
  onClose: () => void;
};

export function TemporaryPasswordDialog({ result, reason, onClose }: Props) {
  const [copyFailed, setCopyFailed] = useState(false);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopyFailed(false);
      notifySuccess('Пароль скопійовано');
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <Dialog
      open
      title={reason === 'created' ? 'Користувача створено' : 'Пароль скинуто'}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Готово
        </Button>
      }
    >
      <p className={styles.passwordFor}>
        Тимчасовий пароль для <strong>{result.user.fullName}</strong> (логін{' '}
        <code>{result.user.login}</code>):
      </p>
      <div className={styles.passwordRow}>
        <code className={styles.password} aria-label="Тимчасовий пароль">
          {result.temporaryPassword}
        </code>
        <Button size="sm" onClick={copyPassword}>
          Копіювати
        </Button>
      </div>
      {copyFailed && (
        <Alert variant="warning">Не вдалося скопіювати автоматично — виділіть пароль вручну.</Alert>
      )}
      <Alert variant="warning">
        Пароль показується лише один раз. Передайте його користувачу — при першому вході система
        попросить задати власний.
      </Alert>
    </Dialog>
  );
}
