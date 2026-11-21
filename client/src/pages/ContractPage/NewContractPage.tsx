import { CONTRACT_TITLES, type ContractFileKind } from '@tu-registry/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { canManageDocuments, ScanDropzone, useApplication } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  ContractForm,
  contractsApi,
  contractsKeys,
  formDefaults,
  showServerError,
  useContractDraft,
  useCreateContract,
  useUploadContractFile,
} from '@/features/contracts';
import { useDepartments } from '@/features/departments';
import { toApiError } from '@/shared/api/apiError';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import { LinkButton, LoadFailed, Spinner } from '@/shared/ui';
import pageStyles from '../page.module.scss';

const FILE_NAMES: Record<ContractFileKind, string> = {
  document: 'Документ договору',
  scan: 'Скан договору',
};

/**
 * «Договір» chosen in «Додати модуль», or ＋ in its tab (agreed 2026-11-20): the form starts
 * from the valid TU and the department's next number. The chosen files go up after the contract
 * is saved; a file that fails leaves the contract saved (two notifications).
 */
export function NewContractPage() {
  const { id = '' } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const application = useApplication(id);
  const draft = useContractDraft(id);
  const departments = useDepartments();
  const create = useCreateContract(id);
  const upload = useUploadContractFile(id);
  const [files, setFiles] = useState<Record<ContractFileKind, File | null>>({
    document: null,
    scan: null,
  });
  const tabPath = `/applications/${id}?tab=contract`;

  // The department select shows only once its options are there (an uncontrolled select would
  // otherwise settle on whichever option comes first).
  if (application.isPending || draft.isPending || departments.isPending) {
    return <Spinner label="Завантаження договору…" />;
  }
  const app = application.data;
  const draftError = draft.error ? toApiError(draft.error) : null;
  const unavailable = !app
    ? null
    : !canManageDocuments(app, user)
      ? 'Додавати договори можна лише в активних заявах свого управління.'
      : draftError?.code === 'NO_TECHNICAL_CONDITIONS'
        ? draftError.message
        : null;
  if (app && unavailable) {
    return (
      <section className={pageStyles.narrow}>
        <h1>Договір недоступний</h1>
        <p className={pageStyles.muted}>{unavailable}</p>
        <div>
          <LinkButton to={`/applications/${id}`}>До заяви {app.regNumber}</LinkButton>
        </div>
      </section>
    );
  }
  if (!app || !draft.data) {
    return (
      <LoadFailed
        error={application.error ?? draft.error}
        onRetry={() => {
          if (application.isError) void application.refetch();
          if (draft.isError) void draft.refetch();
        }}
      />
    );
  }

  const zone = (kind: ContractFileKind, title: string) => (
    <ScanDropzone
      title={title}
      fileType={kind === 'document' ? 'docx' : 'pdf'}
      file={files[kind]}
      onChange={(file) => setFiles((current) => ({ ...current, [kind]: file }))}
    />
  );

  return (
    <section className={pageStyles.centered}>
      <h1>{CONTRACT_TITLES[draft.data.connectionType]}</h1>
      <ContractForm
        defaultValues={formDefaults(draft.data)}
        documentZone={zone('document', 'Документ договору (DOCX)')}
        scanZone={zone('scan', 'Скан укладеного договору')}
        submitLabel="Додати договір"
        cancelTo={`/applications/${id}`}
        onDepartmentChange={async (department, { getValues, setValue }) => {
          const suggested = draft.data.contractNumber;
          // A number typed by hand stays; only the suggested one follows the department.
          if (suggested === null || getValues('contractNumber') !== suggested) return;
          try {
            const next = await queryClient.fetchQuery({
              queryKey: contractsKeys.draft(id, department),
              queryFn: () => contractsApi.draft(id, department),
            });
            if (next.contractNumber && getValues('contractNumber') === suggested) {
              setValue('contractNumber', next.contractNumber, { shouldDirty: true });
            }
          } catch (e) {
            notifyError(`Не вдалося отримати номер договору: ${toApiError(e).message}`);
          }
        }}
        onSubmit={async (values, setError) => {
          let contract;
          try {
            contract = await create.mutateAsync(values);
          } catch (e) {
            return showServerError(e, setError);
          }
          notifySuccess(`Договір № ${contract.contractNumber} додано`);
          for (const kind of ['document', 'scan'] as const) {
            const file = files[kind];
            if (!file) continue;
            try {
              await upload.mutateAsync({ id: contract.id, kind, file });
            } catch (e) {
              notifyError(`${FILE_NAMES[kind]} не завантажено: ${toApiError(e).message}`);
            }
          }
          navigate(tabPath, { replace: true });
        }}
      />
    </section>
  );
}
