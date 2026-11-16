import type { ProcessingDto, TimelineEventDto } from '@tu-registry/shared';
import { http } from '@/shared/api/http';
import { fetchPdf } from '@/shared/lib/pdf';

const DOCUMENT_PATHS: Partial<Record<TimelineEventDto['type'], string>> = {
  RESPONSE: 'responses',
  TECHNICAL_CONDITIONS: 'technical-conditions',
};

export const processingApi = {
  get: (applicationId: string) =>
    http.get<ProcessingDto>(`/applications/${applicationId}/processing`).then((r) => r.data),
  /** The scan of the response or technical conditions an event belongs to. */
  scanOf: (applicationId: string, event: TimelineEventDto) =>
    fetchPdf(
      `/applications/${applicationId}/${DOCUMENT_PATHS[event.type]}/${event.documentId}/scan`,
    ),
};
