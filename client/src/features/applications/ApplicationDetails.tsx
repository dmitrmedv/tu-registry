import { type ApplicationDto, formatPhone } from '@tu-registry/shared';
import type { ReactNode } from 'react';
import { formatCalendarDate, formatDateTime } from '@/shared/lib/format';
import { AREA_TYPE_LABELS, formatObjectCategory, OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import styles from './ApplicationDetails.module.scss';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <dt>{label}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  );
}

export function ApplicationDetails({ app }: { app: ApplicationDto }) {
  return (
    <div className={styles.sections}>
      {app.annulment && (
        <section className={`${styles.section} ${styles.annulled}`} aria-labelledby="annulment">
          <h2 id="annulment">Анулювання</h2>
          <dl>
            <Field label="Причина">{app.annulment.reason}</Field>
            <Field label="Анулював">{app.annulment.by.fullName}</Field>
            <Field label="Коли">{formatDateTime(app.annulment.at)}</Field>
          </dl>
        </section>
      )}

      <section className={styles.section} aria-labelledby="registration">
        <h2 id="registration">Реєстрація</h2>
        <dl>
          <Field label="Номер">{app.regNumber}</Field>
          <Field label="Дата реєстрації">{formatCalendarDate(app.regDate)}</Field>
          <Field label="Спосіб">
            {app.registrationMode === 'MANUAL' ? 'Внесено вручну' : 'Автоматично'}
          </Field>
          <Field label="Зареєстрував">{app.createdBy.fullName}</Field>
          <Field label="Фактично внесено">{formatDateTime(app.createdAt)}</Field>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="customer">
        <h2 id="customer">Замовник</h2>
        <dl>
          <Field label="Замовник">{app.customer}</Field>
          <Field label="Представник замовника">{app.customerRepresentative}</Field>
          <Field label="Телефон">
            <a href={`tel:${app.phone}`}>{formatPhone(app.phone)}</a>
          </Field>
          <Field label="Email">
            {app.email && <a href={`mailto:${app.email}`}>{app.email}</a>}
          </Field>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="object">
        <h2 id="object">Обʼєкт</h2>
        <dl>
          <Field label="Населений пункт">{app.settlement}</Field>
          <Field label="Адреса">{app.objectAddress}</Field>
          <Field label="Місцевість">{app.areaType && AREA_TYPE_LABELS[app.areaType]}</Field>
          <Field label="Тип обʼєкта">{OBJECT_TYPE_LABELS[app.objectType]}</Field>
          <Field label="Категорія">
            {formatObjectCategory(app.objectCategory, app.objectCategoryOther)}
          </Field>
        </dl>
      </section>

      {app.comment && (
        <section className={`${styles.section} ${styles.wide}`} aria-labelledby="comment">
          <h2 id="comment">Коментар</h2>
          <p className={styles.comment}>{app.comment}</p>
        </section>
      )}
    </div>
  );
}
