import { type CalendarDayDto, kyivCalendarDate } from '@tu-registry/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  CalendarDayDialog,
  CalendarTable,
  useCalendarDays,
  useDeleteCalendarDay,
  weekdayOf,
} from '@/features/calendar';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { Alert, Button, ConfirmDialog, SelectField, Spinner } from '@/shared/ui';
import pageStyles from '../page.module.scss';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; day: CalendarDayDto }
  | { kind: 'delete'; day: CalendarDayDto; error?: string };

/** The year shown lives in the URL (?year=2027); the current Kyiv year by default. */
function useYear() {
  const [search, setSearch] = useSearchParams();
  const current = Number(kyivCalendarDate().slice(0, 4));
  const requested = Number(search.get('year'));
  const year =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2099 ? requested : current;
  const options = [...new Set([current - 2, current - 1, current, current + 1, year])]
    .sort((a, b) => a - b)
    .map((value) => ({ value: String(value), label: String(value) }));
  const setYear = (value: number) =>
    setSearch(value === current ? {} : { year: String(value) }, { replace: true });
  return { year, options, setYear };
}

export function CalendarPage() {
  const { year, options, setYear } = useYear();
  const days = useCalendarDays(year);
  const remove = useDeleteCalendarDay();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [notice, setNotice] = useState<string>();
  const close = () => setDialog({ kind: 'none' });

  const describe = (day: CalendarDayDto) =>
    `${formatCalendarDate(day.date)}, ${weekdayOf(day.date)}`;

  return (
    <section className={pageStyles.wide}>
      <div className={pageStyles.header}>
        <h1>Календар робочих днів</h1>
        <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
          Додати день
        </Button>
      </div>
      <p className={pageStyles.muted}>
        Субота й неділя — вихідні, решта днів — робочі. Тут вносяться лише винятки: свята й
        додаткові вихідні в будні та робочі суботи чи неділі. Строки відповідей (5 робочих днів) і
        технічних умов (10) рахуються за цим календарем; зміни діють одразу.
      </p>

      <SelectField
        label="Рік"
        options={options}
        value={String(year)}
        onChange={(e) => setYear(Number(e.target.value))}
      />

      {notice && <Alert variant="success">{notice}</Alert>}

      {days.isPending ? (
        <Spinner label="Завантаження календаря…" />
      ) : days.isError ? (
        <Alert variant="error">
          {toApiError(days.error).message}{' '}
          <Button size="sm" onClick={() => days.refetch()}>
            Повторити
          </Button>
        </Alert>
      ) : days.data.length === 0 ? (
        <p className={pageStyles.muted}>У {year} році винятків немає.</p>
      ) : (
        <CalendarTable
          days={days.data}
          onEdit={(day) => setDialog({ kind: 'edit', day })}
          onDelete={(day) => setDialog({ kind: 'delete', day })}
        />
      )}

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <CalendarDayDialog
          day={dialog.kind === 'edit' ? dialog.day : undefined}
          onClose={close}
          onSaved={(saved) => {
            setNotice(
              dialog.kind === 'edit'
                ? `День ${describe(saved)} збережено`
                : `День ${describe(saved)} додано`,
            );
            // A date of another year: show the year it went into.
            if (Number(saved.date.slice(0, 4)) !== year) setYear(Number(saved.date.slice(0, 4)));
            close();
          }}
        />
      )}

      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title={`Видалити ${describe(dialog.day)} з календаря?`}
          confirmLabel="Видалити"
          loading={remove.isPending}
          error={dialog.error}
          onCancel={close}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(dialog.day.date);
              setNotice(`День ${describe(dialog.day)} видалено з календаря`);
              close();
            } catch (e) {
              setDialog({ ...dialog, error: toApiError(e).message });
            }
          }}
        >
          <p>
            Цей день знову стане {dialog.day.kind === 'NON_WORKING' ? 'робочим' : 'вихідним'}, і
            строки заяв перерахуються. Запис про зміну лишиться в журналі.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
