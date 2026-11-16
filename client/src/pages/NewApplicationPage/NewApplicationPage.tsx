import { type ApplicationDto, formatFileSize } from '@tu-registry/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { ApplicationForm, ScanDropzone, useUploadScan } from '@/features/applications';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { Alert, Button } from '@/shared/ui';
import pageStyles from '../page.module.scss';
import styles from './NewApplicationPage.module.scss';

export function NewApplicationPage() {
  const [created, setCreated] = useState<ApplicationDto | null>(null);
  const [scan, setScan] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string>();
  const upload = useUploadScan();

  // The application is registered first; the scan follows. If the scan fails, the
  // application still stands and the scan can be added from its card.
  const handleCreated = async (application: ApplicationDto) => {
    let result = application;
    setScanError(undefined);
    if (scan) {
      setProgress(0);
      try {
        result = await upload.mutateAsync({
          id: application.id,
          file: scan,
          onProgress: setProgress,
        });
      } catch (error) {
        setScanError(toApiError(error).message);
      } finally {
        setProgress(null);
      }
    }
    setScan(null);
    setCreated(result);
  };

  // The next form starts empty and in automatic mode, also after a manual entry.
  const registerAnother = () => {
    setCreated(null);
    setScanError(undefined);
  };

  return (
    <section className={pageStyles.wide}>
      <h1>Нова заява</h1>
      {created ? (
        <div className={styles.result}>
          <Alert variant="success">
            {created.registrationMode === 'MANUAL'
              ? 'Заяву внесено вручну: '
              : 'Заяву зареєстровано: '}
            <strong className={styles.number}>{created.regNumber}</strong> від{' '}
            {formatCalendarDate(created.regDate)}
          </Alert>
          {created.scan && (
            <p className={pageStyles.muted}>
              Скан «{created.scan.name}» ({formatFileSize(created.scan.size)}) додано.
            </p>
          )}
          {scanError && (
            <Alert variant="warning">
              Скан не завантажено: {scanError} Додайте його в{' '}
              <Link to={`/applications/${created.id}/edit`}>редагуванні заяви</Link>.
            </Alert>
          )}
          <p className={pageStyles.muted}>
            {created.customer} — {created.objectAddress}
          </p>
          <div>
            <Button variant="primary" onClick={registerAnother}>
              Зареєструвати ще
            </Button>
          </div>
        </div>
      ) : (
        <div className={pageStyles.withSide}>
          <aside className={pageStyles.side} aria-labelledby="new-scan-title">
            <h2 id="new-scan-title" className={styles.sideTitle}>
              Скан пакета документів
            </h2>
            <p className={pageStyles.muted}>Необовʼязково. Завантажиться разом із заявою.</p>
            <ScanDropzone file={scan} onChange={setScan} disabled={progress !== null} />
            {progress !== null && (
              <p role="status" className={pageStyles.muted}>
                Завантаження скану… {progress}%
              </p>
            )}
          </aside>
          <ApplicationForm onCreated={handleCreated} />
        </div>
      )}
    </section>
  );
}
