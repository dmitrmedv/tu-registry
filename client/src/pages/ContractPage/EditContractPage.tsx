import { CONTRACT_TITLES, type ContractDto, type ContractFileKind } from '@tu-registry/shared';
import { useNavigate, useParams } from 'react-router';
import {
  canManageDocuments,
  ScanPanel,
  useApplication,
  useScanChange,
} from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  ContractForm,
  formDefaults,
  hasChanges,
  openContractFile,
  showServerError,
  useContracts,
  useRemoveContractFile,
  useUpdateContract,
  useUploadContractFile,
} from '@/features/contracts';
import { useDepartments } from '@/features/departments';
import { notifyInfo, notifySuccess } from '@/shared/lib/notify';
import { LinkButton, LoadFailed, Spinner } from '@/shared/ui';
import pageStyles from '../page.module.scss';

/** A file change of a saved contract, applied by «Зберегти» after the fields. */
function useFileChange(applicationId: string, id: string, kind: ContractFileKind) {
  const upload = useUploadContractFile(applicationId);
  const remove = useRemoveContractFile(applicationId);
  return useScanChange({
    upload: (file, onProgress) => upload.mutateAsync({ id, kind, file, onProgress }),
    remove: () => remove.mutateAsync({ id, kind }),
  });
}

/** Editing a saved contract: the same page as a new one, its files changed only on «Зберегти». */
export function EditContractPage() {
  const { id = '', cid = '' } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const application = useApplication(id);
  const list = useContracts(id);
  const departments = useDepartments();
  const update = useUpdateContract(id);
  const documentChange = useFileChange(id, cid, 'document');
  const scanChange = useFileChange(id, cid, 'scan');
  const tabPath = `/applications/${id}?tab=contract`;

  if (application.isPending || list.isPending || departments.isPending) {
    return <Spinner label="Завантаження договору…" />;
  }
  const failure = application.error ?? list.error;
  if (failure) {
    return (
      <LoadFailed
        error={failure}
        onRetry={() => {
          if (application.isError) void application.refetch();
          if (list.isError) void list.refetch();
        }}
      />
    );
  }

  const app = application.data!;
  const contract = list.data!.find((item) => item.id === cid);
  const unavailable = !contract
    ? 'Такого договору в заяві немає.'
    : !canManageDocuments(app, user)
      ? 'Змінювати договори можна лише в активних заявах свого управління.'
      : contract.cancellation
        ? 'Анульований договір не редагується.'
        : null;
  if (!contract || unavailable) {
    return (
      <section className={pageStyles.narrow}>
        <h1>Редагування недоступне</h1>
        <p className={pageStyles.muted}>{unavailable}</p>
        <div>
          <LinkButton to={tabPath}>До заяви {app.regNumber}</LinkButton>
        </div>
      </section>
    );
  }

  const panel = (kind: ContractFileKind, title: string, file: ContractDto['scan']) => (
    <ScanPanel
      title={title}
      fileType={kind === 'document' ? 'docx' : 'pdf'}
      scan={file}
      scanChange={kind === 'document' ? documentChange : scanChange}
      onView={() => openContractFile(app.id, contract, kind)}
    />
  );

  return (
    <section className={pageStyles.centered}>
      <h1>
        {CONTRACT_TITLES[contract.connectionType]} № {contract.contractNumber}
      </h1>
      <ContractForm
        // A new version (saved fields, then a failed file) rebuilds the form from fresh data.
        key={contract.version}
        defaultValues={formDefaults(contract)}
        documentZone={panel('document', 'Документ договору (DOCX)', contract.document)}
        scanZone={panel('scan', 'Скан укладеного договору', contract.scan)}
        submitLabel="Зберегти"
        cancelTo={tabPath}
        editing={{ filesChanged: documentChange.changed || scanChange.changed }}
        onSubmit={async (values, setError) => {
          const fields = hasChanges(contract, values);
          if (!fields && !documentChange.changed && !scanChange.changed) {
            return notifyInfo('Змін немає — зберігати нічого.');
          }
          if (fields) {
            try {
              await update.mutateAsync({
                id: contract.id,
                input: { ...values, version: contract.version },
              });
            } catch (e) {
              return showServerError(e, setError);
            }
          }
          try {
            await documentChange.apply();
            await scanChange.apply();
          } catch {
            // The failed file says why in a notification; the rest is saved.
            return;
          }
          notifySuccess(`Договір № ${values.contractNumber} збережено`);
          navigate(tabPath, { replace: true });
        }}
      />
    </section>
  );
}
