import { type ApplicationDto, formatPhone } from '@tu-registry/shared';
import { formatCalendarDate, formatDateTime } from '@/shared/lib/format';
import {
  accountNumberLabel,
  AREA_TYPE_LABELS,
  formatObjectCategory,
  GASIFICATION_TYPE_LABELS,
  OBJECT_TYPE_LABELS,
} from '@/shared/lib/labels';
import { DataList, DataRow } from '@/shared/ui';
import styles from './ApplicationDetails.module.scss';

/**
 * The «Заява» tab, as on the mock-up (agreed 2026-11-17): the registration and, under it, the
 * object on the left, the customer on the right; one column on narrow screens. The annulment
 * above them, the comment under the customer.
 */
export function ApplicationDetails({ app }: { app: ApplicationDto }) {
  return (
    <div className={styles.details}>
      {app.annulment && (
        <div className={styles.annulled}>
          <DataList labels="fixed">
            <DataRow label="Анульовано">{formatDateTime(app.annulment.at)}</DataRow>
            <DataRow label="Анулював">{app.annulment.by.fullName}</DataRow>
            <DataRow label="Причина">{app.annulment.reason}</DataRow>
          </DataList>
        </div>
      )}
      <div className={styles.column}>
        <DataList labels="fixed">
          <DataRow label="Номер реєстрації">{app.regNumber}</DataRow>
          <DataRow label="Дата реєстрації">{formatCalendarDate(app.regDate)}</DataRow>
          <DataRow label="Зареєстрував">{app.createdBy.fullName}</DataRow>
          <DataRow label="Фактично внесено">{formatDateTime(app.createdAt)}</DataRow>
        </DataList>
        <DataList labels="fixed">
          <DataRow label="Населений пункт">{app.settlement}</DataRow>
          <DataRow label="Адреса">{app.objectAddress}</DataRow>
          <DataRow label="Вид газифікації">
            {app.gasificationType && GASIFICATION_TYPE_LABELS[app.gasificationType]}
          </DataRow>
          <DataRow label="Місцевість">{app.areaType && AREA_TYPE_LABELS[app.areaType]}</DataRow>
          <DataRow label="Тип обʼєкта">{OBJECT_TYPE_LABELS[app.objectType]}</DataRow>
          <DataRow label="Категорія">
            {formatObjectCategory(app.objectCategory, app.objectCategoryOther)}
          </DataRow>
          {(app.gasificationType !== 'NEW' || app.accountNumber) && (
            <DataRow label={accountNumberLabel(app.objectType)}>{app.accountNumber}</DataRow>
          )}
        </DataList>
      </div>
      <div className={styles.column}>
        <DataList labels="fixed">
          <DataRow label="Замовник">{app.customer}</DataRow>
          <DataRow label="Представник замовника">{app.customerRepresentative}</DataRow>
          <DataRow label="Телефон">
            <a href={`tel:${app.phone}`}>{formatPhone(app.phone)}</a>
          </DataRow>
          <DataRow label="Email">
            {app.email && <a href={`mailto:${app.email}`}>{app.email}</a>}
          </DataRow>
          {app.comment && (
            <DataRow label="Коментар">
              <span className={styles.comment}>{app.comment}</span>
            </DataRow>
          )}
        </DataList>
      </div>
    </div>
  );
}
