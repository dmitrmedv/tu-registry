import { zodResolver } from '@hookform/resolvers/zod';
import {
  CALENDAR_DAY_KINDS,
  type CalendarDayDto,
  createCalendarDaySchema,
  isWeekendDate,
} from '@tu-registry/shared';
import { type FieldPath, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { CALENDAR_DAY_KIND_LABELS } from '@/shared/lib/labels';
import { Alert, Button, ChoiceField, Dialog, TextField } from '@/shared/ui';
import styles from './calendar.module.scss';
import { useCreateCalendarDay, useUpdateCalendarDay } from './queries';
import { weekdayOf } from './weekday';

type FormInput = z.input<typeof createCalendarDaySchema>;
type FormOutput = z.output<typeof createCalendarDaySchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

const FORM_ID = 'calendar-day-form';
const KIND_OPTIONS = CALENDAR_DAY_KINDS.map((kind) => ({
  value: kind,
  label: CALENDAR_DAY_KIND_LABELS[kind],
}));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Props = {
  /** Editing this one (its type and description); a new date when absent. */
  day?: CalendarDayDto;
  onClose: () => void;
  onSaved: (day: CalendarDayDto) => void;
};

export function CalendarDayDialog({ day, onClose, onSaved }: Props) {
  const create = useCreateCalendarDay();
  const update = useUpdateCalendarDay();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createCalendarDaySchema),
    defaultValues: {
      date: day?.date ?? '',
      kind: day?.kind ?? 'NON_WORKING',
      description: day?.description ?? '',
    },
  });
  const date = watch('date');
  const validDate = ISO_DATE.test(date);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = day
        ? await update.mutateAsync({
            date: day.date,
            input: { kind: values.kind, description: values.description },
          })
        : await create.mutateAsync(values);
      onSaved(saved);
    } catch (error) {
      const apiError = toApiError(error);
      const fieldErrors = (apiError.details as ServerErrorDetails | undefined)?.fieldErrors ?? {};
      const fields = Object.entries(fieldErrors);
      for (const [field, messages] of fields) {
        if (messages?.[0]) setError(field as FieldPath<FormInput>, { message: messages[0] });
      }
      if (fields.length === 0) setError('root', { message: apiError.message });
    }
  });

  const dateField = register('date');

  return (
    <Dialog
      busy={isSubmitting}
      open
      title={day ? `Редагування: ${formatCalendarDate(day.date)}` : 'Новий день у календарі'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {day ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={styles.formContents}>
        {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
        {day ? (
          // The date is the entry's key: to move it, delete it and add another.
          <p>
            Дата: {formatCalendarDate(day.date)}, {weekdayOf(day.date)}
          </p>
        ) : (
          <TextField
            label="Дата"
            type="date"
            hint={
              validDate
                ? `${weekdayOf(date)}, ${isWeekendDate(date) ? 'вихідний' : 'будній день'}`
                : undefined
            }
            error={errors.date?.message}
            {...dateField}
            onChange={async (event) => {
              await dateField.onChange(event);
              // The only sensible type follows from the weekday: suggest it.
              const value = event.target.value;
              if (ISO_DATE.test(value)) {
                setValue('kind', isWeekendDate(value) ? 'WORKING' : 'NON_WORKING');
              }
            }}
          />
        )}
        <ChoiceField
          legend="Тип дня"
          options={KIND_OPTIONS}
          hint="Неробочий — свято чи додатковий вихідний у будній день; робочий — субота чи неділя, коли працюють"
          error={errors.kind?.message}
          {...register('kind')}
        />
        <TextField
          label="Опис"
          placeholder="День Незалежності; відпрацювання за 24.08"
          error={errors.description?.message}
          {...register('description')}
        />
      </form>
    </Dialog>
  );
}
