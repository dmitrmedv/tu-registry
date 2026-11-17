import { type ApplicationDto, formatPhone } from '@tu-registry/shared';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useDepartments } from '@/features/departments';
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

/** A titled group of fields inside the «Заява» block. */
function Group({
  title,
  wide = false,
  danger = false,
  children,
}: {
  title: string;
  wide?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={clsx(styles.group, wide && styles.wide, danger && styles.annulled)}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** The application's own data, grouped, for the «Заява» block of the card. */
export function ApplicationDetails({ app }: { app: ApplicationDto }) {
  const { nameOf } = useDepartments();
  return (
    <div className={styles.groups}>
      {app.annulment && (
        <Group title="Анулювання" wide danger>
          <dl>
            <Field label="Причина">{app.annulment.reason}</Field>
            <Field label="Анулював">{app.annulment.by.fullName}</Field>
            <Field label="Коли">{formatDateTime(app.annulment.at)}</Field>
          </dl>
        </Group>
      )}

      <Group title="Реєстрація">
        <dl>
          <Field label="Номер">{app.regNumber}</Field>
          <Field label="Управління">{nameOf(app.department)}</Field>
          <Field label="Дата реєстрації">{formatCalendarDate(app.regDate)}</Field>
          <Field label="Спосіб">
            {app.registrationMode === 'MANUAL' ? 'Внесено вручну' : 'Автоматично'}
          </Field>
          <Field label="Зареєстрував">{app.createdBy.fullName}</Field>
          <Field label="Фактично внесено">{formatDateTime(app.createdAt)}</Field>
          <Field label="Скан документів">{app.scan?.name}</Field>
        </dl>
      </Group>

      <Group title="Замовник">
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
      </Group>

      <Group title="Обʼєкт">
        <dl>
          <Field label="Населений пункт">{app.settlement}</Field>
          <Field label="Адреса">{app.objectAddress}</Field>
          <Field label="Місцевість">{app.areaType && AREA_TYPE_LABELS[app.areaType]}</Field>
          <Field label="Тип обʼєкта">{OBJECT_TYPE_LABELS[app.objectType]}</Field>
          <Field label="Категорія">
            {formatObjectCategory(app.objectCategory, app.objectCategoryOther)}
          </Field>
        </dl>
      </Group>

      {app.comment && (
        <Group title="Коментар" wide>
          <p className={styles.comment}>{app.comment}</p>
        </Group>
      )}
    </div>
  );
}
