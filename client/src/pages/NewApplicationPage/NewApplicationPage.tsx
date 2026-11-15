import type { ApplicationDto } from '@tu-registry/shared';
import { useState } from 'react';
import { ApplicationForm } from '@/features/applications';
import { formatCalendarDate } from '@/shared/lib/format';
import { Alert, Button } from '@/shared/ui';
import pageStyles from '../page.module.scss';
import styles from './NewApplicationPage.module.scss';

export function NewApplicationPage() {
  const [created, setCreated] = useState<ApplicationDto | null>(null);

  return (
    <section className={pageStyles.wide}>
      <h1>Нова заява</h1>
      {created ? (
        <div className={styles.result}>
          <Alert variant="success">
            Заяву зареєстровано: <strong className={styles.number}>{created.regNumber}</strong> від{' '}
            {formatCalendarDate(created.regDate)}
          </Alert>
          <p className={pageStyles.muted}>
            {created.customer} — {created.objectAddress}
          </p>
          <div>
            <Button variant="primary" onClick={() => setCreated(null)}>
              Зареєструвати ще
            </Button>
          </div>
        </div>
      ) : (
        <ApplicationForm onCreated={setCreated} />
      )}
    </section>
  );
}
