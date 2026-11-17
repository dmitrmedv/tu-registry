import type { ProcessingDto } from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const processingApi = {
  get: (applicationId: string) =>
    http.get<ProcessingDto>(`/applications/${applicationId}/processing`).then((r) => r.data),
};
