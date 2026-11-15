import { OBJECT_TYPES, type ObjectType, type UserOptionDto } from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import { Button, SelectField, TextField } from '@/shared/ui';
import styles from './registry.module.scss';
import { isNumberSearchValid, isPeriodValid, type RegistryParams } from './registryParams';
import { SearchField } from './SearchField';

type Props = {
  params: RegistryParams;
  update: (patch: Partial<RegistryParams>, options?: { replace?: boolean }) => void;
  reset: () => void;
  activeFilterCount: number;
  users: UserOptionDto[] | undefined;
};

const TYPE_OPTIONS = [
  { value: '', label: 'Усі типи' },
  ...OBJECT_TYPES.map((type) => ({ value: type, label: OBJECT_TYPE_LABELS[type] })),
];

export function RegistryFilters({ params, update, reset, activeFilterCount, users }: Props) {
  const [open, setOpen] = useState(false);
  // Typing creates no history entries; picking a value does.
  const commitText = (key: 'customer' | 'address' | 'number') => (value: string) =>
    update({ [key]: value }, { replace: true });

  const userOptions = [
    { value: 'mine', label: 'Мої заяви' },
    { value: 'all', label: 'Усі користувачі' },
    ...(users ?? []).map((u) => ({
      value: u.id,
      label: u.isActive ? u.fullName : `${u.fullName} (деактивований)`,
    })),
  ];

  return (
    <section className={styles.filters} aria-label="Фільтри">
      <Button
        className={styles.filtersToggle}
        aria-expanded={open}
        aria-controls="registry-filters"
        onClick={() => setOpen((v) => !v)}
      >
        Фільтри{activeFilterCount > 0 && ` (${activeFilterCount})`}
      </Button>

      <div
        id="registry-filters"
        className={clsx(styles.filterPanel, open && styles.filterPanelOpen)}
      >
        <SearchField label="Замовник" value={params.customer} onCommit={commitText('customer')} />
        <SearchField label="Адреса" value={params.address} onCommit={commitText('address')} />
        <SearchField
          label="Номер"
          placeholder="15 або 15т/26"
          value={params.number}
          onCommit={commitText('number')}
          error={
            params.number && !isNumberSearchValid(params.number)
              ? 'Номер: 15 або 15т/26'
              : undefined
          }
        />
        <SelectField
          label="Тип обʼєкта"
          options={TYPE_OPTIONS}
          value={params.type}
          onChange={(e) => update({ type: e.target.value as ObjectType | '' })}
        />
        <SelectField
          label="Користувач"
          options={userOptions}
          value={params.user}
          onChange={(e) => update({ user: e.target.value })}
        />
        <TextField
          label="Дата з"
          type="date"
          value={params.from}
          max={params.to || undefined}
          onChange={(e) => update({ from: e.target.value })}
        />
        <TextField
          label="Дата по"
          type="date"
          value={params.to}
          min={params.from || undefined}
          error={isPeriodValid(params) ? undefined : 'Кінець періоду раніше за початок'}
          onChange={(e) => update({ to: e.target.value })}
        />
        <div className={styles.resetCell}>
          <Button variant="ghost" onClick={reset} disabled={activeFilterCount === 0}>
            Скинути фільтри
          </Button>
        </div>
      </div>
    </section>
  );
}
