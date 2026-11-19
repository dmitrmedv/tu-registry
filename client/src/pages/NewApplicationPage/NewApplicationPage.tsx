import type { ApplicationDto } from '@tu-registry/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApplicationForm, ScanDropzone, useUploadScan } from '@/features/applications';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { notifySuccess } from '@/shared/lib/notify';
import { Alert, Button } from '@/shared/ui';
import pageStyles from '../page.module.scss';
import styles from './NewApplicationPage.module.scss';

/** «Заяву зареєстровано: 15т/26-8 від 12.03.2026». */
const registeredText = (app: ApplicationDto) =>
  `${app.registrationMode === 'MANUAL' ? 'Заяву внесено вручну' : 'Заяву зареєстровано'}: ${
    app.regNumber
  } від ${formatCalendarDate(app.regDate)}`;

export function NewApplicationPage() {
  const navigate = useNavigate();
  const [created, setCreated] = useState<ApplicationDto | null>(null);
  const [scan, setScan] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string>();
  const upload = useUploadScan();

  // The application is registered first; the scan follows. Then the registry opens with a
  // notification (agreed 2026-11-18). If the scan fails, the application still stands: the page
  // stays, saying where to add the scan.
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
        // Registered all the same: a notification; the page stays, saying where to add the scan.
        notifySuccess(registeredText(result));
        setScanError(toApiError(error).message);
        setScan(null);
        setCreated(result);
        return;
      } finally {
        setProgress(null);
      }
    }
    notifySuccess(result.scan ? `${registeredText(result)}. Скан додано.` : registeredText(result));
    navigate('/');
  };

  // The next form starts empty and in automatic mode, also after a manual entry.
  const registerAnother = () => {
    setCreated(null);
    setScanError(undefined);
  };

  return (
    <section className={pageStyles.centered}>
      <h1>Нова заява</h1>
      {created ? (
        <div className={styles.result}>
          <p>
            Заява <strong className={styles.number}>{created.regNumber}</strong> від{' '}
            {formatCalendarDate(created.regDate)}
          </p>
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
          <div className={pageStyles.side}>
            <ScanDropzone
              title="Скан пакета документів"
              file={scan}
              onChange={setScan}
              disabled={progress !== null}
            >
              {progress !== null && (
                <p role="status" className={pageStyles.muted}>
                  Завантаження скану… {progress}%
                </p>
              )}
            </ScanDropzone>
          </div>
          <ApplicationForm onCreated={handleCreated} />
        </div>
      )}
    </section>
  );
}
