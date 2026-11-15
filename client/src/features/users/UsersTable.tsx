import type { UserDto } from '@tu-registry/shared';
import { formatDateTime } from '@/shared/lib/format';
import { ROLE_LABELS } from '@/shared/lib/labels';
import { Badge, Button, Table } from '@/shared/ui';
import styles from './users.module.scss';

type Props = {
  users: UserDto[];
  currentUserId: string;
  onEdit: (user: UserDto) => void;
  onResetPassword: (user: UserDto) => void;
};

export function UsersTable({ users, currentUserId, onEdit, onResetPassword }: Props) {
  return (
    <Table caption="Користувачі системи">
      <thead>
        <tr>
          <th scope="col">ПІБ</th>
          <th scope="col">Логін</th>
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
                <Button
                  size="sm"
                  onClick={() => onEdit(user)}
                  aria-label={`Редагувати: ${user.fullName}`}
                >
                  Редагувати
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onResetPassword(user)}
                  aria-label={`Скинути пароль: ${user.fullName}`}
                >
                  Скинути пароль
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
