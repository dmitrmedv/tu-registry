import {
  CONNECTION_POINTS,
  CONNECTION_TYPES,
  type Department,
  GAS_PRESSURES,
  kyivCalendarDate,
} from '@tu-registry/shared';
import { useFormContext } from 'react-hook-form';
import { useEngineerOptions } from '@/features/engineers';
import {
  CONNECTION_POINT_LABELS,
  CONNECTION_TYPE_LABELS,
  GAS_PRESSURE_LABELS,
} from '@/shared/lib/labels';
import { ChoiceField, LoadFailed, SelectField, Spinner, TextField } from '@/shared/ui';
import type { FormInput } from './technicalConditionsForm';
import { useDayOff } from '@/features/calendar';

const options = <Code extends string>(codes: readonly Code[], labels: Record<Code, string>) =>
  codes.map((code) => ({ value: code, label: labels[code] }));

/** Number, date and engineer: the document itself. */
export function DocumentFields({
  department,
  engineerId,
}: {
  department: Department;
  /** Kept on offer even when deactivated since. */
  engineerId?: string;
}) {
  const dayOff = useDayOff();
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<FormInput>();
  const { query: engineers, options: engineerOptions } = useEngineerOptions(department, engineerId);
  return (
    <>
      <TextField
        label="Реєстраційний номер ТУ"
        autoComplete="off"
        error={errors.tuNumber?.message}
        {...register('tuNumber')}
      />
      <TextField
        label="Дата підготовки ТУ"
        type="date"
        max={kyivCalendarDate()}
        error={errors.preparedDate?.message ?? dayOff(watch('preparedDate'))}
        {...register('preparedDate')}
      />
      {engineers.isPending ? (
        // An uncontrolled select would otherwise settle on whichever option comes first.
        <Spinner label="Завантаження інженерів…" />
      ) : engineers.isError ? (
        <LoadFailed error={engineers.error} onRetry={() => engineers.refetch()} />
      ) : (
        <SelectField
          label="Інженер, який розробив ТУ"
          options={engineerOptions}
          hint={
            engineerOptions.length === 1
              ? 'В управлінні ще немає інженерів: їх додає адміністратор'
              : undefined
          }
          error={errors.engineer?.message}
          {...register('engineer')}
        />
      )}
    </>
  );
}

/** Customer and address as written in the conditions. */
export function CustomerFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<FormInput>();
  return (
    <>
      <TextField
        label="Замовник за ТУ"
        autoComplete="off"
        hint="Із заяви; змініть, якщо в ТУ записано інакше"
        error={errors.customer?.message}
        {...register('customer')}
      />
      <TextField
        label="Адреса за ТУ"
        autoComplete="off"
        hint="Із заяви: населений пункт і адреса"
        error={errors.address?.message}
        {...register('address')}
      />
    </>
  );
}

/** Gas flow, connection type, pressure and connection point. */
export function ConnectionFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<FormInput>();
  return (
    <>
      <TextField
        label="Витрати газу, м³/год"
        inputMode="decimal"
        autoComplete="off"
        hint="Наприклад 2,5; до трьох знаків після коми"
        error={errors.gasFlow?.message}
        {...register('gasFlow')}
      />
      <ChoiceField
        legend="Тип приєднання"
        options={options(CONNECTION_TYPES, CONNECTION_TYPE_LABELS)}
        error={errors.connectionType?.message}
        {...register('connectionType')}
      />
      <ChoiceField
        legend="Тиск газу"
        options={options(GAS_PRESSURES, GAS_PRESSURE_LABELS)}
        error={errors.gasPressure?.message}
        {...register('gasPressure')}
      />
      <ChoiceField
        legend="Точка приєднання"
        options={options(CONNECTION_POINTS, CONNECTION_POINT_LABELS)}
        error={errors.connectionPoint?.message}
        {...register('connectionPoint')}
      />
    </>
  );
}
