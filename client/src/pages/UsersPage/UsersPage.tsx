import {
  type UpdateUserInput,
  type UserDto,
  type UserWithTemporaryPassword,
} from '@tu-registry/shared';
import { useMemo, useState } from 'react';
import { useCurrentUser } from '@/features/auth';
import { useDepartments } from '@/features/departments';
import {
  CreateUserDialog,
  EditUserDialog,
  TemporaryPasswordDialog,
  UsersTable,
  useResetPassword,
  useUpdateUser,
  useUsers,
} from '@/features/users';
import { toApiError } from '@/shared/api/apiError';
import { Alert, Button, CheckboxField, ConfirmDialog, Spinner, TextField } from '@/shared/ui';
import pageStyles from '../page.module.scss';
import styles from './UsersPage.module.scss';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; user: UserDto; error?: string }
  | { kind: 'confirm-deactivate'; user: UserDto; changes: UpdateUserInput; error?: string }
  | { kind: 'confirm-reset'; user: UserDto; error?: string }
  | { kind: 'temp-password'; result: UserWithTemporaryPassword; reason: 'created' | 'reset' };

export function UsersPage() {
  const currentUser = useCurrentUser();
  const { data: users, isPending, isError, error, refetch } = useUsers();
  const { nameOf } = useDepartments();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const close = () => setDialog({ kind: 'none' });

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (users ?? []).filter(
      (user) =>
        (showInactive || user.isActive) &&
        (!query ||
          user.fullName.toLowerCase().includes(query) ||
          user.login.includes(query) ||
          nameOf(user.department).toLowerCase().includes(query)),
    );
  }, [users, search, showInactive, nameOf]);

  const saveChanges = async (user: UserDto, changes: UpdateUserInput) => {
    await updateUser.mutateAsync({ id: user.id, input: changes });
    close();
  };

  const handleEditSubmit = async (user: UserDto, changes: UpdateUserInput) => {
    // Deactivation ends the user's sessions immediately, so it is confirmed separately.
    if (changes.isActive === false) {
      setDialog({ kind: 'confirm-deactivate', user, changes });
      return;
    }
    try {
      await saveChanges(user, changes);
    } catch (e) {
      setDialog({ kind: 'edit', user, error: toApiError(e).message });
    }
  };

  const confirmDeactivate = async (user: UserDto, changes: UpdateUserInput) => {
    try {
      await saveChanges(user, changes);
    } catch (e) {
      setDialog({ kind: 'confirm-deactivate', user, changes, error: toApiError(e).message });
    }
  };

  const confirmReset = async (user: UserDto) => {
    try {
      const result = await resetPassword.mutateAsync(user.id);
      setDialog({ kind: 'temp-password', result, reason: 'reset' });
    } catch (e) {
      setDialog({ kind: 'confirm-reset', user, error: toApiError(e).message });
    }
  };

  return (
    <section className={pageStyles.wide}>
      <div className={pageStyles.header}>
        <h1>Користувачі</h1>
        <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
          Додати користувача
        </Button>
      </div>

      <div className={styles.toolbar}>
        <TextField
          className={styles.search}
          label="Пошук"
          type="search"
          placeholder="ПІБ, логін або управління"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <CheckboxField
          label="Показати деактивованих"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
      </div>

      {isPending ? (
        <Spinner label="Завантаження користувачів…" />
      ) : isError ? (
        <Alert variant="error">
          {toApiError(error).message}{' '}
          <Button size="sm" onClick={() => refetch()}>
            Повторити
          </Button>
        </Alert>
      ) : visibleUsers.length === 0 ? (
        <p className={pageStyles.muted}>Користувачів не знайдено.</p>
      ) : (
        <>
          <p className={styles.count}>
            Показано {visibleUsers.length} з {users.length}
          </p>
          <UsersTable
            users={visibleUsers}
            currentUserId={currentUser.id}
            onEdit={(user) => setDialog({ kind: 'edit', user })}
            onResetPassword={(user) => setDialog({ kind: 'confirm-reset', user })}
          />
        </>
      )}

      <CreateUserDialog
        open={dialog.kind === 'create'}
        onClose={close}
        onCreated={(result) => setDialog({ kind: 'temp-password', result, reason: 'created' })}
      />

      {dialog.kind === 'edit' && (
        <EditUserDialog
          user={dialog.user}
          isSelf={dialog.user.id === currentUser.id}
          error={dialog.error}
          onClose={close}
          onSubmit={(changes) => handleEditSubmit(dialog.user, changes)}
        />
      )}

      {dialog.kind === 'confirm-deactivate' && (
        <ConfirmDialog
          open
          danger
          title="Деактивувати користувача?"
          confirmLabel="Деактивувати"
          loading={updateUser.isPending}
          error={dialog.error}
          onCancel={close}
          onConfirm={() => confirmDeactivate(dialog.user, dialog.changes)}
        >
          <p>
            <strong>{dialog.user.fullName}</strong> більше не зможе увійти, а всі його активні сесії
            буде завершено негайно. Повторно активувати обліковий запис можна будь-коли.
          </p>
        </ConfirmDialog>
      )}

      {dialog.kind === 'confirm-reset' && (
        <ConfirmDialog
          open
          title="Скинути пароль?"
          confirmLabel="Скинути пароль"
          loading={resetPassword.isPending}
          error={dialog.error}
          onCancel={close}
          onConfirm={() => confirmReset(dialog.user)}
        >
          <p>
            Для <strong>{dialog.user.fullName}</strong> буде згенеровано новий тимчасовий пароль.
            Поточний пароль перестане діяти, а всі сесії буде завершено.
          </p>
        </ConfirmDialog>
      )}

      {dialog.kind === 'temp-password' && (
        <TemporaryPasswordDialog result={dialog.result} reason={dialog.reason} onClose={close} />
      )}
    </section>
  );
}
