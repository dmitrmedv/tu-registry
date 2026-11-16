import { type ApplicationDto, formatFileSize } from '@tu-registry/shared';
import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { formatDateTime } from '@/shared/lib/format';
import { Alert, Button, ConfirmDialog, Icon } from '@/shared/ui';
import { openScan } from './openScan';
import { useRemoveScan, useUploadScan } from './queries';
import { ScanDropzone } from './ScanDropzone';
import styles from './ScanPanel.module.scss';

/** The application's scanned documents on the edit page: what is stored, opening and changing it. */
export function ScanPanel({ app }: { app: ApplicationDto }) {
  const upload = useUploadScan();
  const remove = useRemoveScan();
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string }>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const scan = app.scan;

  const view = async () => {
    setMessage(undefined);
    try {
      await openScan(app.id, scan!.name);
    } catch (error) {
      setMessage({ tone: 'error', text: toApiError(error).message });
    }
  };

  const replace = async (file: File | null) => {
    if (!file) return;
    setMessage(undefined);
    setProgress(0);
    try {
      await upload.mutateAsync({ id: app.id, file, onProgress: setProgress });
      setMessage({ tone: 'success', text: scan ? 'Скан замінено' : 'Скан додано' });
    } catch (error) {
      setMessage({ tone: 'error', text: `Скан не завантажено: ${toApiError(error).message}` });
    } finally {
      setProgress(null);
    }
  };

  const removeScan = async () => {
    try {
      await remove.mutateAsync(app.id);
      setMessage({ tone: 'success', text: 'Скан видалено' });
    } catch (error) {
      setMessage({ tone: 'error', text: toApiError(error).message });
    } finally {
      setConfirmRemove(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="scan-title">
      <h2 id="scan-title" className={styles.title}>
        Скан пакета документів
      </h2>
      {scan ? (
        <div className={styles.current}>
          <p className={styles.name}>{scan.name}</p>
          <p className={styles.meta}>
            {formatFileSize(scan.size)} · {scan.uploadedBy.fullName},{' '}
            {formatDateTime(scan.uploadedAt)}
          </p>
          <div className={styles.actions}>
            <Button size="sm" onClick={view}>
              <Icon name="eye" />
              Переглянути
            </Button>
            <Button size="sm" onClick={() => setConfirmRemove(true)}>
              <Icon name="trash" />
              Видалити скан
            </Button>
          </div>
        </div>
      ) : (
        <p className={styles.meta}>Скан не додано.</p>
      )}
      <ScanDropzone
        file={null}
        onChange={replace}
        chooseLabel={scan ? 'Замінити файл' : 'Обрати файл'}
        disabled={progress !== null}
      />
      {progress !== null && (
        <p role="status" className={styles.meta}>
          Завантаження скану… {progress}%
        </p>
      )}
      {message && <Alert variant={message.tone}>{message.text}</Alert>}

      {confirmRemove && scan && (
        <ConfirmDialog
          open
          danger
          title="Видалити скан?"
          confirmLabel="Видалити"
          loading={remove.isPending}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={removeScan}
        >
          <p>
            Файл «{scan.name}» буде видалено з заяви {app.regNumber}. Запис про це лишиться в
            історії змін.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
