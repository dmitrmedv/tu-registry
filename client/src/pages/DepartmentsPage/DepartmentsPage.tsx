import type { DepartmentAdminDto } from '@tu-registry/shared';
import { useState } from 'react';
import {
  DepartmentDialog,
  DepartmentsTable,
  useArchiveDepartment,
  useDeleteDepartment,
  useDepartmentList,
  useRestoreDepartment,
} from '@/features/departments';
import { toApiError } from '@/shared/api/apiError';
import { notifySuccess } from '@/shared/lib/notify';
import { Alert, Button, ConfirmDialog, Spinner } from '@/shared/ui';
import pageStyles from '../page.module.scss';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; department: DepartmentAdminDto }
  | { kind: 'archive'; department: DepartmentAdminDto; error?: string }
  | { kind: 'delete'; department: DepartmentAdminDto; error?: string };

export function DepartmentsPage() {
  const list = useDepartmentList();
  const archive = useArchiveDepartment();
  const restore = useRestoreDepartment();
  const remove = useDeleteDepartment();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [error, setError] = useState<string>();
  const close = () => setDialog({ kind: 'none' });

  // The admin's list carries the counts (the API adds them for admins).
  const departments = (list.data ?? []) as DepartmentAdminDto[];
  const nextCode = Math.max(0, ...departments.map((department) => department.code)) + 1;

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError(undefined);
    try {
      await action();
      notifySuccess(done);
      close();
    } catch (e) {
      const message = toApiError(e).message;
      setDialog((current) =>
        current.kind === 'archive' || current.kind === 'delete'
          ? { ...current, error: message }
          : current,
      );
      if (dialog.kind === 'none') setError(message);
    }
  };

  return (
    <section className={pageStyles.wide}>
      <div className={pageStyles.header}>
        <h1>Управління</h1>
        <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
          Додати управління
        </Button>
      </div>
      <p className={pageStyles.muted}>
        Код іде в номер заяви (1т/26-8). Управління з користувачами чи заявами не видаляється, а
        архівується: його заяви лишаються, але нових користувачів і заяв у ньому створити не можна.
      </p>
      {error && <Alert variant="error">{error}</Alert>}

      {list.isPending ? (
        <Spinner label="Завантаження управлінь…" />
      ) : list.isError ? (
        <Alert variant="error">
          {toApiError(list.error).message}{' '}
          <Button size="sm" onClick={() => list.refetch()}>
            Повторити
          </Button>
        </Alert>
      ) : (
        <DepartmentsTable
          departments={departments}
          onEdit={(department) => setDialog({ kind: 'edit', department })}
          onArchive={(department) => setDialog({ kind: 'archive', department })}
          onRestore={(department) =>
            run(
              () => restore.mutateAsync(department.id),
              `Управління «${department.name}» відновлено`,
            )
          }
          onDelete={(department) => setDialog({ kind: 'delete', department })}
        />
      )}

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <DepartmentDialog
          department={dialog.kind === 'edit' ? dialog.department : undefined}
          suggestedCode={nextCode}
          onClose={close}
          onSaved={(saved) => {
            notifySuccess(
              dialog.kind === 'edit'
                ? `Управління «${saved.name}» збережено`
                : `Управління «${saved.name}» додано`,
            );
            close();
          }}
        />
      )}

      {dialog.kind === 'archive' && (
        <ConfirmDialog
          open
          title={`Архівувати управління «${dialog.department.name}»?`}
          confirmLabel="Архівувати"
          loading={archive.isPending}
          error={dialog.error}
          onCancel={close}
          onConfirm={() =>
            run(
              () => archive.mutateAsync(dialog.department.id),
              `Управління «${dialog.department.name}» архівовано`,
            )
          }
        >
          <p>
            Користувачі ({dialog.department.usersCount}) і заяви (
            {dialog.department.applicationsCount}) лишаються й працюють як раніше. Додати нового
            користувача, зареєструвати чи перенести заяву в це управління не можна, поки його не
            відновлено.
          </p>
        </ConfirmDialog>
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title={`Видалити управління «${dialog.department.name}»?`}
          confirmLabel="Видалити"
          loading={remove.isPending}
          error={dialog.error}
          onCancel={close}
          onConfirm={() =>
            run(
              () => remove.mutateAsync(dialog.department.id),
              `Управління «${dialog.department.name}» видалено`,
            )
          }
        >
          <p>У ньому немає ні користувачів, ні заяв. Видалення не можна скасувати.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
