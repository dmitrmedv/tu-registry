import type { DepartmentAdminDto } from '@tu-registry/shared';
import { Badge, Button, Table } from '@/shared/ui';
import styles from './departments.module.scss';

type Props = {
  departments: DepartmentAdminDto[];
  onEdit: (department: DepartmentAdminDto) => void;
  onArchive: (department: DepartmentAdminDto) => void;
  onRestore: (department: DepartmentAdminDto) => void;
  onDelete: (department: DepartmentAdminDto) => void;
};

/** Empty departments can be deleted; ones with users or applications only archived. */
const isEmpty = (department: DepartmentAdminDto) =>
  department.usersCount === 0 && department.applicationsCount === 0;

export function DepartmentsTable({ departments, onEdit, onArchive, onRestore, onDelete }: Props) {
  return (
    <Table caption="Управління">
      <thead>
        <tr>
          <th scope="col">Код</th>
          <th scope="col">Назва</th>
          <th scope="col">Користувачів</th>
          <th scope="col">Заяв</th>
          <th scope="col">Статус</th>
          <th scope="col">
            <span className="visually-hidden">Дії</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {departments.map((department) => (
          <tr key={department.id} className={department.archived ? styles.archivedRow : undefined}>
            <td className={styles.number}>{department.code}</td>
            <td>{department.name}</td>
            <td className={styles.number}>{department.usersCount}</td>
            <td className={styles.number}>{department.applicationsCount}</td>
            <td>{department.archived ? <Badge>В архіві</Badge> : 'Активне'}</td>
            <td>
              <div className={styles.actions}>
                <Button
                  size="sm"
                  aria-label={`Редагувати: ${department.name}`}
                  onClick={() => onEdit(department)}
                >
                  Редагувати
                </Button>
                {department.archived ? (
                  <Button
                    size="sm"
                    aria-label={`Відновити: ${department.name}`}
                    onClick={() => onRestore(department)}
                  >
                    Відновити
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    aria-label={`Архівувати: ${department.name}`}
                    onClick={() => onArchive(department)}
                  >
                    Архівувати
                  </Button>
                )}
                {isEmpty(department) && (
                  // Plain here (one per empty row adds up); the confirmation is the red one.
                  <Button
                    size="sm"
                    aria-label={`Видалити: ${department.name}`}
                    onClick={() => onDelete(department)}
                  >
                    Видалити
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
