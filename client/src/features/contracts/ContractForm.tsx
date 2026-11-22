import { zodResolver } from '@hookform/resolvers/zod';
import { kyivCalendarDate } from '@tu-registry/shared';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useForm, type UseFormReturn, type UseFormSetError } from 'react-hook-form';
import { applicationFormStyles as formStyles } from '@/features/applications';
import { useDepartments } from '@/features/departments';
import { Button, LinkButton, SelectField, TextAreaField, TextField } from '@/shared/ui';
import { type FormData, type FormInput, formSchema } from './contractFormValues';
import styles from './ContractForm.module.scss';
import { useDayOff } from '@/features/calendar';

type Props = {
  defaultValues: FormInput;
  /** The zone of the contract's Word document, beside the department. */
  documentZone: ReactNode;
  /** The zone of the signed contract's scan, beside the signing date. */
  scanZone: ReactNode;
  submitLabel: string;
  cancelTo: string;
  /**
   * Editing a saved contract: «Зберегти» waits for a change of the fields or of a file
   * (`filesChanged`). A new contract is saved as it comes.
   */
  editing?: { filesChanged: boolean };
  /** A new contract's number follows the department chosen. */
  onDepartmentChange?: (
    department: string,
    form: Pick<UseFormReturn<FormInput>, 'getValues' | 'setValue'>,
  ) => void;
  onSubmit: (values: FormData, setError: UseFormSetError<FormInput>) => Promise<void>;
};

/**
 * The contract (mock-up 2026-11-20): number, date, customer and address with the department
 * and the Word document beside them; under them the signing date and the representative with
 * the scan of the signed contract; then the comment.
 */
export function ContractForm({
  defaultValues,
  documentZone,
  scanZone,
  submitLabel,
  cancelTo,
  editing,
  onDepartmentChange,
  onSubmit,
}: Props) {
  const { optionsWith } = useDepartments();
  const dayOff = useDayOff();
  const {
    register,
    watch,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });
  const today = kyivCalendarDate();
  const department = register('department');

  return (
    <form
      className={clsx(formStyles.form, styles.form)}
      onSubmit={handleSubmit((values) => onSubmit(values, setError))}
      noValidate
    >
      <fieldset className={formStyles.section}>
        <legend className="visually-hidden">Договір</legend>
        <div className={styles.block}>
          <div className={styles.fields}>
            <TextField
              label="№ договору"
              autoComplete="off"
              error={errors.contractNumber?.message}
              {...register('contractNumber')}
            />
            <TextField
              label="Дата договору"
              type="date"
              max={today}
              error={errors.contractDate?.message ?? dayOff(watch('contractDate'))}
              {...register('contractDate')}
            />
            <TextField
              className={styles.wide}
              label="Замовник"
              error={errors.customer?.message}
              {...register('customer')}
            />
            <TextField
              className={styles.wide}
              label="Адреса обʼєкта"
              error={errors.address?.message}
              {...register('address')}
            />
          </div>
          <div className={styles.side}>
            <SelectField
              label="Управління"
              options={optionsWith(defaultValues.department)}
              error={errors.department?.message}
              {...department}
              onChange={async (event) => {
                await department.onChange(event);
                onDepartmentChange?.(event.target.value, { getValues, setValue });
              }}
            />
            {documentZone}
          </div>
        </div>
      </fieldset>

      <fieldset className={formStyles.section}>
        <legend className="visually-hidden">Укладання договору</legend>
        <div className={styles.block}>
          <div className={styles.fields}>
            <TextField
              label="Дата укладання договору"
              type="date"
              max={today}
              error={errors.signedDate?.message ?? dayOff(watch('signedDate'))}
              {...register('signedDate')}
            />
            <TextField
              className={styles.wide}
              label="Представник замовника"
              hint="Якщо договір підписує представник за довіреністю"
              error={errors.representative?.message}
              {...register('representative')}
            />
          </div>
          <div className={styles.side}>{scanZone}</div>
        </div>
      </fieldset>

      <fieldset className={formStyles.section}>
        <legend>Додатково</legend>
        <TextAreaField
          label="Коментар (необовʼязково)"
          rows={4}
          error={errors.comment?.message}
          {...register('comment')}
        />
      </fieldset>

      <div className={formStyles.actions}>
        <LinkButton to={cancelTo}>Скасувати</LinkButton>
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={editing && !isDirty && !editing.filesChanged}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
