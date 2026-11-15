import { QueryClient } from '@tanstack/react-query';
import { toApiError } from '@/shared/api/apiError';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry once on network/server errors; a 4xx will not fix itself.
      retry: (failureCount, error) => {
        const { status } = toApiError(error);
        return failureCount < 1 && !(status >= 400 && status < 500);
      },
    },
  },
});
