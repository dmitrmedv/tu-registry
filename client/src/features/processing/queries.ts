import { useQuery } from '@tanstack/react-query';
import { processingApi } from './api';

/** Under the application's key: any change of the application or its documents refreshes it. */
export const processingKeys = {
  detail: (applicationId: string) => ['applications', applicationId, 'processing'] as const,
};

export function useProcessing(applicationId: string) {
  return useQuery({
    queryKey: processingKeys.detail(applicationId),
    queryFn: () => processingApi.get(applicationId),
  });
}
