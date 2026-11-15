import type { ApplicationDto } from '@tu-registry/shared';
import { useState } from 'react';
import { ApplicationForm, type ManualDefaults } from '@/features/applications';
import { formatCalendarDate } from '@/shared/lib/format';
import { Alert, Button } from '@/shared/ui';
import pageStyles from '../page.module.scss';
import styles from './NewApplicationPage.module.scss';

export function NewApplicationPage() {
  const [created, setCreated] = useState<ApplicationDto | null>(null);
  const [manualDefaults, setManualDefaults] = useState<ManualDefaults>();

  const registerAnother = () => {
    // Back-dated entry usually comes in batches from one day: keep the mode and the date.
    setManualDefaults(
      created?.registrationMode === 'MANUAL' ? { regDate: created.regDate } : undefined,
    );
    setCreated(null);
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
        <ApplicationForm onCreated={setCreated} manualDefaults={manualDefaults} />
      )}
    </section>
  );
}
