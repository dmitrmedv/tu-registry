import type { AuditListQuery, AuditLogDto, Paginated } from '@tu-registry/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '@/shared/api/http';

export function useAuditLog(query: AuditListQuery) {
  return useQuery({
    queryKey: ['audit', query],
    queryFn: () =>
      http.get<Paginated<AuditLogDto>>('/audit', { params: query }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}
