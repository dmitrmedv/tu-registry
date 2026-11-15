import type { UserWithTemporaryPassword } from '@tu-registry/shared';
import { useState } from 'react';
import { Alert, Button, Dialog } from '@/shared/ui';
import styles from './users.module.scss';

type Props = {
  result: UserWithTemporaryPassword;
  reason: 'created' | 'reset';
  onClose: () => void;
};

export function TemporaryPasswordDialog({ result, reason, onClose }: Props) {
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopy('done');
    } catch {
      setCopy('failed');
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
      {copy === 'done' && <Alert variant="success">Скопійовано</Alert>}
      {copy === 'failed' && (
        <Alert variant="warning">Не вдалося скопіювати автоматично — виділіть пароль вручну.</Alert>
      )}
      <Alert variant="warning">
        Пароль показується лише один раз. Передайте його користувачу — при першому вході система
        попросить задати власний.
      </Alert>
    </Dialog>
  );
}
