import type { UserDto } from '@tu-registry/shared';
import { useDepartments } from '@/features/departments';
import { formatDateTime } from '@/shared/lib/format';
import { ROLE_LABELS } from '@/shared/lib/labels';
import { Badge, IconButton, Table } from '@/shared/ui';
import styles from './users.module.scss';

type Props = {
  users: UserDto[];
  currentUserId: string;
  onEdit: (user: UserDto) => void;
  onResetPassword: (user: UserDto) => void;
};

export function UsersTable({ users, currentUserId, onEdit, onResetPassword }: Props) {
  const { nameOf } = useDepartments();
  return (
    <Table caption="Користувачі системи">
      <thead>
        <tr>
          <th scope="col">ПІБ</th>
          <th scope="col">Логін</th>
          <th scope="col">Управління</th>
          <th scope="col">Роль</th>
          <th scope="col">Уповноважений</th>
          <th scope="col">Статус</th>
          <th scope="col">Останній вхід</th>
          <th scope="col">
            <span className="visually-hidden">Дії</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className={user.isActive ? undefined : styles.inactiveRow}>
            <td>
              {user.fullName}
              {user.id === currentUserId && <span className={styles.you}> (ви)</span>}
            </td>
            <td>
              <code>{user.login}</code>
            </td>
            <td className={styles.nowrap}>{nameOf(user.department)}</td>
            <td>{ROLE_LABELS[user.role]}</td>
            <td>{user.canManageRegistration ? 'Так' : '—'}</td>
            <td>
              {user.isActive ? (
                user.mustChangePassword ? (
                  <Badge tone="info">Очікує зміни пароля</Badge>
                ) : (
                  <Badge tone="success">Активний</Badge>
                )
              ) : (
                <Badge tone="danger">Деактивований</Badge>
              )}
            </td>
            <td className={styles.nowrap}>{formatDateTime(user.lastLoginAt)}</td>
            <td>
              <div className={styles.actions}>
                <IconButton
                  icon="pencil"
                  label={`Редагувати: ${user.fullName}`}
                  onClick={() => onEdit(user)}
                />
                <IconButton
                  icon="key"
                  label={`Скинути пароль: ${user.fullName}`}
                  onClick={() => onResetPassword(user)}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
