import { zodResolver } from '@hookform/resolvers/zod';
import { type ApplicationDto, kyivCalendarDate, type ProjectDto } from '@tu-registry/shared';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ScanPanel, useScanChange } from '@/features/applications';
import { documentStyles } from '@/features/documents';
import { useEngineerOptions } from '@/features/engineers';
import { useTechnicalConditions } from '@/features/technicalConditions';
import { openPdf } from '@/shared/lib/pdf';
import { notifySuccess } from '@/shared/lib/notify';
import { Button, Dialog, LoadFailed, SelectField, Spinner, TextField } from '@/shared/ui';
import { projectsApi } from './api';
import {
  changedFields,
  type FormData,
  formDefaults,
  type FormInput,
  formSchema,
  showServerError,
} from './projectForm';
import {
  useCreateProject,
  useRemoveProjectScan,
  useUpdateProject,
  useUploadProjectScan,
} from './queries';
import styles from './ProjectDialog.module.scss';
import { useDayOff } from '@/features/calendar';

const FORM_ID = 'project-form';

type Props = {
  app: ApplicationDto;
  /** The project to change; a new one when absent. */
  project?: ProjectDto;
  onClose: () => void;
  onSaved: (saved: ProjectDto) => void;
};

/**
 * «Проєкт» (2026-11-21): the approval's number, date and engineer (the TU's by default) with the
 * project's scan; the estimate has its own dialog (`EstimateDialog`). The scan changes only on
 * «Зберегти», after the fields; if it fails, the project is already saved and the dialog stays
 * open on it.
 */
export function ProjectDialog(props: Props) {
  const tus = useTechnicalConditions(props.app.id);
  if (!props.project && tus.isPending) {
    return (
      <Dialog open title="Новий проєкт" onClose={props.onClose}>
        <Spinner label="Завантаження технічних умов…" />
      </Dialog>
    );
  }
  const tuEngineerId = tus.data?.find((tu) => !tu.cancellation)?.engineer.id;
  return <ProjectForm {...props} tuEngineerId={tuEngineerId} />;
}

function ProjectForm({
  app,
  project: initial,
  tuEngineerId,
  onClose,
  onSaved,
}: Props & { tuEngineerId?: string }) {
  const [project, setProject] = useState(initial);
  // The files go to the project just saved: its id is known only after the fields are.
  const idRef = useRef(initial?.id);
  const create = useCreateProject(app.id);
  const update = useUpdateProject(app.id);
  const uploadScan = useUploadProjectScan(app.id);
  const removeScan = useRemoveProjectScan(app.id);
  const scan = useScanChange({
    upload: (file, onProgress) => uploadScan.mutateAsync({ id: idRef.current!, file, onProgress }),
    remove: () => removeScan.mutateAsync(idRef.current!),
  });
  const engineerId = initial?.engineer.id ?? tuEngineerId;
  const { query: engineers, options: engineerOptions } = useEngineerOptions(
    app.department,
    engineerId,
  );
  const dayOff = useDayOff();
  const {
    register,
    watch,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults(initial, tuEngineerId),
  });

  const save = async (values: FormData) => {
    if (!project) return create.mutateAsync(values);
    const input = changedFields(project, values);
    return input ? update.mutateAsync({ id: project.id, input }) : project;
  };

  const onSubmit = handleSubmit(async (values) => {
    let saved: ProjectDto;
    try {
      saved = await save(values);
    } catch (error) {
      return showServerError(error, setError);
    }
    // From here on the dialog changes this project, whatever happens to the files.
    idRef.current = saved.id;
    setProject(saved);
    try {
      await scan.apply();
    } catch {
      // The project stands, a file does not: the reason is in a notification already.
      if (!project) notifySuccess(`Проєкт № ${saved.approvalNumber} збережено`);
      return;
    }
    onSaved(saved);
  });

  const today = kyivCalendarDate();
  const viewScan = () =>
    openPdf(() => projectsApi.scanFile(app.id, project!.id), project?.scan?.name ?? 'проєкт.pdf');

  return (
    <Dialog
      busy={isSubmitting}
      open
      size="lg"
      title={project ? `Проєкт № ${project.approvalNumber}` : 'Новий проєкт'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {project ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={documentStyles.formContents}>
        <div className={styles.row}>
          <div className={styles.fields}>
            <TextField
              label="№ узгодження"
              autoComplete="off"
              error={errors.approvalNumber?.message}
              {...register('approvalNumber')}
            />
            <TextField
              label="Дата узгодження"
              type="date"
              max={today}
              error={errors.approvalDate?.message ?? dayOff(watch('approvalDate'))}
              {...register('approvalDate')}
            />
            <TextField
              label="Проєктна організація"
              autoComplete="off"
              error={errors.designOrganization?.message}
              {...register('designOrganization')}
            />
            {engineers.isPending ? (
              // An uncontrolled select would otherwise settle on whichever option comes first.
              <Spinner label="Завантаження інженерів…" />
            ) : engineers.isError ? (
              <LoadFailed error={engineers.error} onRetry={() => engineers.refetch()} />
            ) : (
              <SelectField
                label="Виконавець"
                options={engineerOptions}
                hint={initial ? undefined : 'За замовчуванням — виконавець ТУ'}
                error={errors.engineer?.message}
                {...register('engineer')}
              />
            )}
          </div>
          <ScanPanel
            title="Скан проєкту"
            scan={project?.scan ?? null}
            scanChange={scan}
            onView={viewScan}
            disabled={isSubmitting}
          />
        </div>
      </form>
    </Dialog>
  );
}
