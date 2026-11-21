import type {
  CancelDocumentInput,
  ContractDraftDto,
  ContractDto,
  ContractFileKind,
  SaveContractInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';
import { fetchPdf } from '@/shared/lib/pdf';

const base = (applicationId: string) => `/applications/${applicationId}/contracts`;

export const contractsApi = {
  list: (applicationId: string) => http.get<ContractDto[]>(base(applicationId)).then((r) => r.data),
  /** The new contract's starting values; `department` picks whose next number. */
  draft: (applicationId: string, department?: string) =>
    http
      .get<ContractDraftDto>(`${base(applicationId)}/draft`, {
        params: department ? { department } : undefined,
      })
      .then((r) => r.data),
  create: (applicationId: string, input: SaveContractInput) =>
    http.post<ContractDto>(base(applicationId), input).then((r) => r.data),
  update: (applicationId: string, id: string, input: SaveContractInput & { version: number }) =>
    http.patch<ContractDto>(`${base(applicationId)}/${id}`, input).then((r) => r.data),
  cancel: (applicationId: string, id: string, input: CancelDocumentInput) =>
    http.post<ContractDto>(`${base(applicationId)}/${id}/cancel`, input).then((r) => r.data),
  /** For good, with its files; an admin only. */
  remove: async (applicationId: string, id: string, version: number) => {
    await http.delete(`${base(applicationId)}/${id}`, { params: { version } });
  },
  /** The Word document goes in the "document" field, the signed scan in "scan". */
  uploadFile: (
    applicationId: string,
    id: string,
    kind: ContractFileKind,
    file: File,
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append(kind, file);
    return http
      .put<ContractDto>(`${base(applicationId)}/${id}/files/${kind}`, form, {
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
      })
      .then((r) => r.data);
  },
  removeFile: (applicationId: string, id: string, kind: ContractFileKind) =>
    http.delete<ContractDto>(`${base(applicationId)}/${id}/files/${kind}`).then((r) => r.data),
  file: (applicationId: string, id: string, kind: ContractFileKind) =>
    fetchPdf(`${base(applicationId)}/${id}/files/${kind}`),
};
