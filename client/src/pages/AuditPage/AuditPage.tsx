import { AUDIT_ACTIONS, type AuditAction, PAGE_SIZES } from '@tu-registry/shared';
import { useEffect } from 'react';
import {
  AuditTable,
  countAuditFilters,
  DEFAULT_AUDIT_PARAMS,
  isAuditPeriodValid,
  readAuditParams,
  toAuditQuery,
  useAuditLog,
  writeAuditParams,
} from '@/features/audit';
import { useUserOptions } from '@/features/registry';
import { toApiError } from '@/shared/api/apiError';
import { useListParams } from '@/shared/hooks/useListParams';
import { AUDIT_ACTION_LABELS } from '@/shared/lib/labels';
import { Alert, Button, Pagination, SelectField, Spinner, TextField } from '@/shared/ui';
import pageStyles from '../page.module.scss';
import styles from './AuditPage.module.scss';

const ACTION_OPTIONS = [
  { value: '', label: 'Усі дії' },
  ...AUDIT_ACTIONS.map((action) => ({ value: action, label: AUDIT_ACTION_LABELS[action] })),
];
const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((size) => ({ value: String(size), label: `по ${size}` }));

export function AuditPage() {
  const { params, update, reset } = useListParams({
    read: readAuditParams,
    write: writeAuditParams,
    defaults: DEFAULT_AUDIT_PARAMS,
    keepOnReset: ['limit'],
  });
  const journal = useAuditLog(toAuditQuery(params));
  const users = useUserOptions();
  const meta = journal.data?.meta;

  useEffect(() => {
    if (meta && params.page > meta.totalPages) update({ page: meta.totalPages }, { replace: true });
  }, [meta, params.page, update]);

  const userOptions = [
    { value: '', label: 'Усі користувачі' },
    ...(users.data ?? []).map((u) => ({ value: u.id, label: u.fullName })),
  ];

  return (
    <section className={pageStyles.wide}>
      <h1>Журнал аудиту</h1>
      <p className={pageStyles.muted}>
        Входи, керування користувачами, реєстрація та зміна номерів заяв, відмови в доступі. Записи
        не можна змінити чи видалити.
      </p>

      <div className={styles.filters} role="search" aria-label="Фільтри журналу">
        <SelectField
          label="Дія"
          options={ACTION_OPTIONS}
          value={params.action}
          onChange={(e) => update({ action: e.target.value as AuditAction | '' })}
        />
        <SelectField
          label="Користувач"
          options={userOptions}
          value={params.actor}
          onChange={(e) => update({ actor: e.target.value })}
        />
        <TextField
          label="Дата з"
          type="date"
          value={params.from}
          onChange={(e) => update({ from: e.target.value })}
        />
        <TextField
          label="Дата по"
          type="date"
          value={params.to}
          error={isAuditPeriodValid(params) ? undefined : 'Кінець періоду раніше за початок'}
          onChange={(e) => update({ to: e.target.value })}
        />
        <div className={styles.resetCell}>
          <Button variant="ghost" onClick={reset} disabled={countAuditFilters(params) === 0}>
            Скинути фільтри
          </Button>
        </div>
      </div>

      {journal.isPending ? (
        <Spinner label="Завантаження журналу…" />
      ) : journal.isError ? (
        <Alert variant="error">
          {toApiError(journal.error).message}{' '}
          <Button size="sm" onClick={() => journal.refetch()}>
            Повторити
          </Button>
        </Alert>
      ) : meta!.total === 0 ? (
        <p className={pageStyles.muted}>Записів не знайдено.</p>
      ) : (
        <>
          <p className={pageStyles.muted} role="status">
            Знайдено: {meta!.total}
          </p>
          <AuditTable rows={journal.data.data} />
          <div className={styles.footer}>
            <Pagination
              page={meta!.page}
              totalPages={meta!.totalPages}
              onChange={(page) => update({ page })}
            />
            <SelectField
              className={styles.pageSize}
              label="Рядків на сторінці"
              options={PAGE_SIZE_OPTIONS}
              value={String(params.limit)}
              onChange={(e) => update({ limit: Number(e.target.value) })}
            />
          </div>
        </>
      )}
    </section>
  );
}
