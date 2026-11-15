import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  AREA_TYPES,
  type AreaType,
  OBJECT_CATEGORIES,
  OBJECT_TYPES,
  type ObjectCategory,
  type ObjectType,
  type UserOptionDto,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { AREA_TYPE_LABELS, OBJECT_CATEGORY_LABELS, OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import { Button, SelectField, TextField } from '@/shared/ui';
import styles from './registry.module.scss';
import { isNumberSearchValid, isPeriodValid, type RegistryParams } from './registryParams';
import { SearchField } from './SearchField';

const WIDE_SCREEN = '(min-width: 768px)';

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

const CATEGORY_OPTIONS = [
  { value: '', label: 'Усі категорії' },
  ...OBJECT_CATEGORIES.map((category) => ({
    value: category,
    label: OBJECT_CATEGORY_LABELS[category],
  })),
];

const AREA_OPTIONS = [
  { value: '', label: 'Усі' },
  ...AREA_TYPES.map((area) => ({ value: area, label: AREA_TYPE_LABELS[area] })),
];

const STATUS_OPTIONS = [
  { value: '', label: 'Усі' },
  ...APPLICATION_STATUSES.map((status) => ({
    value: status,
    label: status === 'ACTIVE' ? 'Активні' : 'Анульовані',
  })),
];

export function RegistryFilters({ params, update, reset, activeFilterCount, users }: Props) {
  // Open on wide screens, collapsed on phones; either way the button folds it away.
  const [open, setOpen] = useState(() => window.matchMedia?.(WIDE_SCREEN).matches ?? true);
  // Typing creates no history entries; picking a value does.
  const commitText =
    (key: 'customer' | 'settlement' | 'address' | 'representative' | 'comment' | 'number') =>
    (value: string) =>
      update({ [key]: value }, { replace: true });

  const userOptions = [
    { value: 'all', label: 'Усі користувачі' },
    { value: 'mine', label: 'Мої заяви' },
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
        <SearchField
          label="Населений пункт"
          value={params.settlement}
          onCommit={commitText('settlement')}
        />
        <SearchField label="Адреса" value={params.address} onCommit={commitText('address')} />
        <SearchField
          label="Представник замовника"
          value={params.representative}
          onCommit={commitText('representative')}
        />
        <SearchField label="Коментар" value={params.comment} onCommit={commitText('comment')} />
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
          label="Категорія"
          options={CATEGORY_OPTIONS}
          value={params.category}
          onChange={(e) => update({ category: e.target.value as ObjectCategory | '' })}
        />
        <SelectField
          label="Місцевість"
          options={AREA_OPTIONS}
          value={params.area}
          onChange={(e) => update({ area: e.target.value as AreaType | '' })}
        />
        <SelectField
          label="Статус"
          options={STATUS_OPTIONS}
          value={params.status}
          onChange={(e) => update({ status: e.target.value as ApplicationStatus | '' })}
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
