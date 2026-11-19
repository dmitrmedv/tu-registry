import type { EngineerDto } from '@tu-registry/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCurrentUser } from '@/features/auth';
import { useDepartments } from '@/features/departments';
import {
  EngineerDialog,
  EngineersTable,
  useEngineers,
  useUpdateEngineer,
} from '@/features/engineers';
import { toApiError } from '@/shared/api/apiError';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import { Button, ConfirmDialog, LoadFailed, SelectField, Spinner } from '@/shared/ui';
import pageStyles from '../page.module.scss';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; engineer: EngineerDto }
  | { kind: 'deactivate'; engineer: EngineerDto };

export function EngineersPage() {
  const me = useCurrentUser();
  const departments = useDepartments();
  // The department filter lives in the URL (?department=RENI); none means every department.
  const [search, setSearch] = useSearchParams();
  const department = search.get('department') ?? '';
  const list = useEngineers({ department: department || undefined });
  const update = useUpdateEngineer();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const close = () => setDialog({ kind: 'none' });

  const filtered = departments.list.find((d) => d.id === department);
  // A new engineer goes into the filtered department, unless it is archived.
  const newEngineerDepartment = filtered && !filtered.archived ? filtered.id : me.department;

  const setActive = async (engineer: EngineerDto, isActive: boolean) => {
    try {
      await update.mutateAsync({ id: engineer.id, input: { isActive } });
      notifySuccess(
        isActive
          ? `Інженера «${engineer.fullName}» активовано`
          : `Інженера «${engineer.fullName}» деактивовано`,
      );
      close();
    } catch (e) {
      notifyError(toApiError(e).message);
    }
  };

  return (
    <section className={pageStyles.wide}>
      <div className={pageStyles.header}>
        <h1>Інженери</h1>
        <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
          Додати інженера
        </Button>
      </div>
      <p className={pageStyles.muted}>
        Інженерів обирають у технічних умовах і відповідях на заяви свого управління. Інженер не
        видаляється, а деактивується: внесені раніше документи зберігають його ПІБ, але в нових його
        обрати не можна.
      </p>

      <SelectField
        label="Управління"
        options={[{ value: '', label: 'Усі управління' }, ...departments.allOptions]}
        value={department}
        onChange={(e) =>
          setSearch(e.target.value ? { department: e.target.value } : {}, { replace: true })
        }
      />

      {list.isPending ? (
        <Spinner label="Завантаження інженерів…" />
      ) : list.isError ? (
        <LoadFailed error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className={pageStyles.muted}>Інженерів ще не додано.</p>
      ) : (
        <EngineersTable
          engineers={list.data}
          onEdit={(engineer) => setDialog({ kind: 'edit', engineer })}
          onDeactivate={(engineer) => setDialog({ kind: 'deactivate', engineer })}
          onActivate={(engineer) => setActive(engineer, true)}
        />
      )}

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <EngineerDialog
          engineer={dialog.kind === 'edit' ? dialog.engineer : undefined}
          department={newEngineerDepartment}
          onClose={close}
          onSaved={(saved) => {
            notifySuccess(
              dialog.kind === 'edit'
                ? `Інженера «${saved.fullName}» збережено`
                : `Інженера «${saved.fullName}» додано`,
            );
            close();
          }}
        />
      )}

      {dialog.kind === 'deactivate' && (
        <ConfirmDialog
          open
          title={`Деактивувати інженера «${dialog.engineer.fullName}»?`}
          confirmLabel="Деактивувати"
          loading={update.isPending}
          onCancel={close}
          onConfirm={() => setActive(dialog.engineer, false)}
        >
          <p>
            Документи, у яких він уже зазначений, не зміняться. У нових технічних умовах і
            відповідях обрати його не можна, поки його не активовано знову.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
