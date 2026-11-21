import type { ContractDto, ContractFileKind } from '@tu-registry/shared';
import { downloadFile, openPdf } from '@/shared/lib/pdf';
import { contractsApi } from './api';

/** The signed scan opens in a new tab; the Word document is downloaded. */
export function openContractFile(
  applicationId: string,
  contract: ContractDto,
  kind: ContractFileKind,
) {
  const load = () => contractsApi.file(applicationId, contract.id, kind);
  return kind === 'document'
    ? downloadFile(load, contract.document?.name ?? 'договір.docx')
    : openPdf(load, contract.scan?.name ?? 'договір.pdf');
}
