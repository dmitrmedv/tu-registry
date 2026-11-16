import type { EngineerDto } from '@tu-registry/shared';
import { useDepartments } from '@/features/departments';
import { Badge, Button, Table } from '@/shared/ui';
import styles from './engineers.module.scss';

type Props = {
  engineers: EngineerDto[];
  onEdit: (engineer: EngineerDto) => void;
  onDeactivate: (engineer: EngineerDto) => void;
  onActivate: (engineer: EngineerDto) => void;
};

export function EngineersTable({ engineers, onEdit, onDeactivate, onActivate }: Props) {
  const { nameOf } = useDepartments();
  return (
    <Table caption="Інженери">
      <thead>
        <tr>
          <th scope="col">ПІБ</th>
          <th scope="col">Управління</th>
          <th scope="col">Статус</th>
          <th scope="col">
            <span className="visually-hidden">Дії</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {engineers.map((engineer) => (
          <tr key={engineer.id} className={engineer.isActive ? undefined : styles.inactiveRow}>
            <td>{engineer.fullName}</td>
            <td>{nameOf(engineer.department)}</td>
            <td>{engineer.isActive ? 'Активний' : <Badge>Неактивний</Badge>}</td>
            <td>
              <div className={styles.actions}>
                <Button
                  size="sm"
                  aria-label={`Редагувати: ${engineer.fullName}`}
                  onClick={() => onEdit(engineer)}
                >
                  Редагувати
                </Button>
                {engineer.isActive ? (
                  <Button
                    size="sm"
                    aria-label={`Деактивувати: ${engineer.fullName}`}
                    onClick={() => onDeactivate(engineer)}
                  >
                    Деактивувати
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    aria-label={`Активувати: ${engineer.fullName}`}
                    onClick={() => onActivate(engineer)}
                  >
                    Активувати
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
