import type {
  SaveTuPaymentInput,
  TechnicalConditionsDto,
  TuPaymentScanKind,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';
import { fetchPdf } from '@/shared/lib/pdf';

const base = (applicationId: string, tuId: string) =>
  `/applications/${applicationId}/technical-conditions/${tuId}/payment`;

/** Every call answers with the technical conditions, the payment in their `payment`. */
export const tuPaymentApi = {
  save: (applicationId: string, tuId: string, input: SaveTuPaymentInput) =>
    http.put<TechnicalConditionsDto>(base(applicationId, tuId), input).then((r) => r.data),
  remove: (applicationId: string, tuId: string, version: number) =>
    http
      .delete<TechnicalConditionsDto>(base(applicationId, tuId), { params: { version } })
      .then((r) => r.data),
  uploadScan: (
    applicationId: string,
    tuId: string,
    kind: TuPaymentScanKind,
    file: File,
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append('scan', file);
    return http
      .put<TechnicalConditionsDto>(`${base(applicationId, tuId)}/scans/${kind}`, form, {
        onUploadProgress: (event) =>
          event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      })
      .then((r) => r.data);
  },
  removeScan: (applicationId: string, tuId: string, kind: TuPaymentScanKind) =>
    http
      .delete<TechnicalConditionsDto>(`${base(applicationId, tuId)}/scans/${kind}`)
      .then((r) => r.data),
  scanFile: (applicationId: string, tuId: string, kind: TuPaymentScanKind) =>
    fetchPdf(`${base(applicationId, tuId)}/scans/${kind}`),
};
