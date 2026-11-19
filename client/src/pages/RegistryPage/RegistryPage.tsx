import { PAGE_SIZES } from '@tu-registry/shared';
import clsx from 'clsx';
import { useEffect } from 'react';
import { useCurrentUser } from '@/features/auth';
import {
  ColumnsPicker,
  RegistryFilters,
  RegistryTable,
  toApiQuery,
  useApplicationList,
  useRegistryColumns,
  useRegistryParams,
  useUserOptions,
} from '@/features/registry';
import styles from '@/features/registry/registry.module.scss';
import { Button, LinkButton, LoadFailed, Pagination, SelectField, Spinner } from '@/shared/ui';
import pageStyles from '../page.module.scss';

const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((size) => ({ value: String(size), label: `по ${size}` }));

export function RegistryPage() {
  const user = useCurrentUser();
  const { params, update, reset, activeFilterCount } = useRegistryParams();
  const list = useApplicationList(toApiQuery(params, user));
  const isAdmin = user.role === 'ADMIN';
  const users = useUserOptions();
  const columns = useRegistryColumns(user.id, isAdmin);
  const meta = list.data?.meta;

  // Another page starts from its first row, not where the previous one was scrolled to.
  const changePage = (patch: { page?: number; limit?: number }) => {
    update(patch);
    window.scrollTo({ top: 0 });
  };

  // A page number beyond the end (e.g. after narrowing filters) jumps to the last page.
  useEffect(() => {
    if (meta && params.page > meta.totalPages) update({ page: meta.totalPages }, { replace: true });
  }, [meta, params.page, update]);

  return (
    <section className={pageStyles.wide}>
      <div className={pageStyles.header}>
        <h1 className="visually-hidden">Реєстр заяв</h1>
        <LinkButton to="/applications/new" variant="primary">
          Нова заява
        </LinkButton>
      </div>

      {/* Filters and the result bar (count, pages, page size) stay on screen while scrolling. */}
      <div className={styles.stickyBar}>
        <RegistryFilters
          showDepartment={isAdmin}
          params={params}
          update={update}
          reset={reset}
          activeFilterCount={activeFilterCount}
          users={users.data}
        />
        {meta && meta.total > 0 && (
          <div className={styles.summary}>
            <div className={styles.summaryStart}>
              <span role="status">Знайдено: {meta.total}</span>
              <ColumnsPicker
                columns={columns.available}
                isVisible={columns.isVisible}
                onChange={columns.setVisible}
                onMove={columns.moveColumn}
                onReset={columns.resetColumns}
                isDefault={columns.isDefault}
              />
            </div>
            <div className={styles.paging}>
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                onChange={(page) => changePage({ page })}
              />
              <SelectField
                className={styles.pageSize}
                label="Рядків на сторінці"
                options={PAGE_SIZE_OPTIONS}
                value={String(params.limit)}
                onChange={(e) => changePage({ limit: Number(e.target.value) })}
              />
            </div>
          </div>
        )}
      </div>

      {list.isPending ? (
        <Spinner label="Завантаження заяв…" />
      ) : list.isError ? (
        <LoadFailed error={list.error} onRetry={() => list.refetch()} />
      ) : meta!.total === 0 ? (
        <div className={styles.empty}>
          {params.user === 'mine' && activeFilterCount === 1 ? (
            <>
              <p>Ви ще не зареєстрували жодної заяви.</p>
              <div className={styles.emptyActions}>
                <LinkButton to="/applications/new" variant="primary">
                  Нова заява
                </LinkButton>
                <Button onClick={() => update({ user: 'all' })}>Показати всі заяви</Button>
              </div>
            </>
          ) : activeFilterCount > 0 ? (
            <>
              <p>Нічого не знайдено за вказаними умовами.</p>
              <Button onClick={reset}>Скинути фільтри</Button>
            </>
          ) : (
            <>
              <p>Заяв ще немає.</p>
              <LinkButton to="/applications/new" variant="primary">
                Нова заява
              </LinkButton>
            </>
          )}
        </div>
      ) : (
        <>
          <div
            className={clsx(list.isPlaceholderData && styles.loadingTable)}
            aria-busy={list.isFetching}
          >
            <RegistryTable
              columns={columns.visible}
              rows={list.data.data}
              sort={params.sort}
              onSort={(sort) => update({ sort })}
              widths={columns.widths}
              onWidthsChange={columns.setWidths}
              onColumnMove={columns.moveColumn}
            />
          </div>
        </>
      )}
    </section>
  );
}
