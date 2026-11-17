import type { TechnicalConditionsDto } from '@tu-registry/shared';
import { useScanChange } from '@/features/applications';
import { openPdf } from '@/shared/lib/pdf';
import { technicalConditionsApi } from './api';
import { useRemoveTechnicalConditionsScan, useUploadTechnicalConditionsScan } from './queries';

/** The scan change of saved technical conditions, applied when their edit page is saved. */
export function useTechnicalConditionsScanChange(applicationId: string, id: string) {
  const upload = useUploadTechnicalConditionsScan(applicationId);
  const remove = useRemoveTechnicalConditionsScan(applicationId);
  return useScanChange({
    upload: (file) => upload.mutateAsync({ id, file }),
    remove: () => remove.mutateAsync(id),
  });
}

/** Opens the current scan in a new tab. */
export const openTechnicalConditionsScan = (applicationId: string, tu: TechnicalConditionsDto) =>
  openPdf(() => technicalConditionsApi.scanFile(applicationId, tu.id), tu.scan?.name ?? 'ТУ.pdf');
