import { zodResolver } from '@hookform/resolvers/zod';
import type { ApplicationDto, TechnicalConditionsDto } from '@tu-registry/shared';
import { FormProvider, useForm } from 'react-hook-form';
import { applicationFormStyles as styles } from '@/features/applications';
import { Button, LinkButton } from '@/shared/ui';
import layout from './EditTechnicalConditionsForm.module.scss';
import { useUpdateTechnicalConditions } from './queries';
import {
  changedFields,
  type FormData,
  formDefaults,
  type FormInput,
  formSchema,
  showServerError,
} from './technicalConditionsForm';
import { ConnectionFields, CustomerFields, DocumentFields } from './TechnicalConditionsFields';
import { notifyInfo } from '@/shared/lib/notify';

type Props = {
  app: ApplicationDto;
  technicalConditions: TechnicalConditionsDto;
  /** The scan change chosen beside the form: «Зберегти» applies it after the fields. */
  scanChanged: boolean;
  applyScan: () => Promise<void>;
  /** `fields`: whether the conditions' fields changed, not only their scan. */
  onSaved: (saved: { fields: boolean }) => void;
  cancelTo: string;
};

/** Saved technical conditions on their edit page, laid out like the application's. */
export function EditTechnicalConditionsForm({
  app,
  technicalConditions: tu,
  scanChanged,
  applyScan,
  onSaved,
  cancelTo,
}: Props) {
  const update = useUpdateTechnicalConditions(app.id);
  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults(app, tu),
  });
  const {
    handleSubmit,
    setError,
    formState: { isSubmitting, isDirty },
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    const input = changedFields(tu, values);
    if (!input && !scanChanged) return notifyInfo('Змін немає — зберігати нічого.');
    if (input) {
      try {
        await update.mutateAsync({ id: tu.id, input });
      } catch (error) {
        return showServerError(error, setError);
      }
    }
    try {
      await applyScan();
    } catch {
      // The scan panel shows why; the fields, if any, are saved.
      return;
    }
    onSaved({ fields: input !== null });
  });

  return (
    <FormProvider {...form}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <fieldset className={styles.section}>
          <legend>Технічні умови</legend>
          <div className={layout.documentRow}>
            <DocumentFields department={app.department} engineerId={tu.engineer.id} />
          </div>
        </fieldset>
        <fieldset className={styles.section}>
          <legend>Замовник і обʼєкт</legend>
          <CustomerFields />
        </fieldset>
        <fieldset className={styles.section}>
          <legend>Приєднання</legend>
          <ConnectionFields />
        </fieldset>

        <div className={styles.actions}>
          <LinkButton to={cancelTo}>Скасувати</LinkButton>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={!isDirty && !scanChanged}
          >
            Зберегти
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
