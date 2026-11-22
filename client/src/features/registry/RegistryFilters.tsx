import {
  AREA_TYPES,
  type AreaType,
  type Department,
  GASIFICATION_TYPES,
  type GasificationType,
  OBJECT_CATEGORIES,
  OBJECT_TYPES,
  type ObjectCategory,
  type ObjectType,
  STAGE_FILTERS,
  type StageFilter,
  type UserOptionDto,
} from '@tu-registry/shared';
import { useState } from 'react';
import { useCurrentUser } from '@/features/auth';
import { useDepartments } from '@/features/departments';
import { useEngineers } from '@/features/engineers';
import {
  AREA_TYPE_LABELS,
  GASIFICATION_TYPE_LABELS,
  OBJECT_CATEGORY_LABELS,
  OBJECT_TYPE_LABELS,
  REGISTRY_STAGE_LABELS,
} from '@/shared/lib/labels';
import { Button, ChoiceField, IconButton, SelectField } from '@/shared/ui';
import { PeriodField } from './PeriodField';
import styles from './registry.module.scss';
import { countMoreFilters, isPeriodValid, type RegistryParams } from './registryParams';
import { SearchField } from './SearchField';

type Props = {
  params: RegistryParams;
  /** Admins choose the department; users always work in their own. */
  showDepartment: boolean;
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

const GASIFICATION_OPTIONS = [
  { value: '', label: 'Усі' },
  ...GASIFICATION_TYPES.map((type) => ({ value: type, label: GASIFICATION_TYPE_LABELS[type] })),
];

const STAGE_OPTIONS = [
  { value: '', label: 'Усі' },
  ...STAGE_FILTERS.map((stage) => ({ value: stage, label: REGISTRY_STAGE_LABELS[stage] })),
];

/** Ready-made views: they set the author and «Стан» filters and leave the rest alone. */
const QUICK_VIEWS = [
  { label: 'Усі', patch: { user: 'all', stage: '' } },
  { label: 'Мої', patch: { user: 'mine', stage: '' } },
  { label: 'Анульовані', patch: { user: 'all', stage: 'ANNULLED' } },
] as const satisfies { label: string; patch: Partial<RegistryParams> }[];

export function RegistryFilters({
  params,
  showDepartment,
  update,
  reset,
  activeFilterCount,
  users,
}: Props) {
  const departments = useDepartments();
  const me = useCurrentUser();
  const [moreOpen, setMoreOpen] = useState(false);
  // A user's engineers are their department's (the server decides); an admin's — of the
  // department chosen, or all.
  const engineers = useEngineers({
    department: showDepartment && params.department !== 'all' ? params.department : undefined,
  });
  const engineerList = engineers.data ?? [];
  const engineerOptions = [
    { value: '', label: 'Усі інженери' },
    ...engineerList.map((e) => ({
      value: e.id,
      label: e.isActive ? e.fullName : `${e.fullName} (неактивний)`,
    })),
  ];
  // An old link may carry the signed-in user's id instead of "mine".
  const user = params.user === me.id ? 'mine' : params.user;
  const moreCount = countMoreFilters(params);

  // "Мої заяви" already means the signed-in user: their own name would be the same filter twice.
  const others = (users ?? []).filter((u) => u.id !== me.id);
  const userOptions = [
    { value: 'all', label: 'Усі користувачі' },
    { value: 'mine', label: 'Мої заяви' },
    ...others.map((u) => ({
      value: u.id,
      label: u.isActive ? u.fullName : `${u.fullName} (деактивований)`,
    })),
  ];
  const userName = (id: string) =>
    id === 'mine' ? 'Мої заяви' : (others.find((u) => u.id === id)?.fullName ?? 'обраний');

  // What is set behind «Ще фільтри», visible (and removable) while the panel is folded.
  const chips = [
    params.type && { label: `Тип: ${OBJECT_TYPE_LABELS[params.type]}`, clear: { type: '' } },
    params.category && {
      label: `Категорія: ${OBJECT_CATEGORY_LABELS[params.category]}`,
      clear: { category: '' },
    },
    params.area && { label: `Місцевість: ${AREA_TYPE_LABELS[params.area]}`, clear: { area: '' } },
    params.gas && { label: GASIFICATION_TYPE_LABELS[params.gas], clear: { gas: '' } },
    params.stage && {
      label: `Стан: ${REGISTRY_STAGE_LABELS[params.stage]}`,
      clear: { stage: '' },
    },
    params.engineer && {
      label: `Інженер: ${engineerList.find((e) => e.id === params.engineer)?.fullName ?? 'обраний'}`,
      clear: { engineer: '' },
    },
    user !== 'all' && { label: `Користувач: ${userName(user)}`, clear: { user: 'all' } },
  ].filter((chip) => !!chip) as { label: string; clear: Partial<RegistryParams> }[];

  return (
    <section className={styles.filters} aria-label="Фільтри">
      <div className={styles.mainFilters}>
        <SearchField
          className={styles.search}
          label="Пошук"
          placeholder="Номер заяви, ТУ, відповіді чи договору, замовник, адреса, представник"
          value={params.q}
          onCommit={(q) => update({ q }, { replace: true })}
        />
        {showDepartment && (
          <SelectField
            label="Управління"
            options={[{ value: 'all', label: 'Усі управління' }, ...departments.allOptions]}
            value={params.department}
            onChange={(e) => update({ department: e.target.value as Department | 'all' })}
          />
        )}
        <PeriodField
          from={params.from}
          to={params.to}
          error={isPeriodValid(params) ? undefined : 'Кінець періоду раніше за початок'}
          onChange={(period) => update(period)}
        />
        <Button
          className={styles.moreToggle}
          aria-expanded={moreOpen}
          aria-controls="registry-more-filters"
          onClick={() => setMoreOpen((v) => !v)}
        >
          Ще фільтри{moreCount > 0 && ` (${moreCount})`}
          <span aria-hidden="true">{moreOpen ? '▴' : '▾'}</span>
        </Button>
      </div>

      <div id="registry-more-filters" className={styles.moreFilters} hidden={!moreOpen}>
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
        <ChoiceField
          legend="Місцевість"
          name="registry-area"
          options={AREA_OPTIONS}
          value={params.area}
          onChange={(e) => update({ area: e.target.value as AreaType | '' })}
        />
        <ChoiceField
          legend="Вид газифікації"
          name="registry-gasification"
          options={GASIFICATION_OPTIONS}
          value={params.gas}
          onChange={(e) => update({ gas: e.target.value as GasificationType | '' })}
        />
        <SelectField
          label="Стан"
          options={STAGE_OPTIONS}
          value={params.stage}
          onChange={(e) => update({ stage: e.target.value as StageFilter | '' })}
        />
        <SelectField
          label="Інженер"
          options={engineerOptions}
          value={params.engineer}
          onChange={(e) => update({ engineer: e.target.value })}
        />
        <SelectField
          label="Користувач"
          options={userOptions}
          value={user}
          onChange={(e) => update({ user: e.target.value })}
        />
      </div>

      <div className={styles.filterSummary}>
        <div className={styles.quickViews} role="group" aria-label="Швидкий вибір">
          {QUICK_VIEWS.map((view) => {
            const active = user === view.patch.user && params.stage === view.patch.stage;
            return (
              <Button
                key={view.label}
                size="sm"
                variant={active ? 'primary' : 'ghost'}
                aria-pressed={active}
                onClick={() => update(view.patch)}
              >
                {view.label}
              </Button>
            );
          })}
        </div>
        {chips.length > 0 && (
          <ul className={styles.chips} aria-label="Активні фільтри">
            {chips.map((chip) => (
              <li key={chip.label} className={styles.chip}>
                {chip.label}
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Прибрати фільтр «${chip.label}»`}
                  onClick={() => update(chip.clear)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {activeFilterCount > 0 && (
          <IconButton icon="filterOff" label="Скинути всі фільтри" onClick={reset} />
        )}
      </div>
    </section>
  );
}
