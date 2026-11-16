import type { EngineerListQuery, UpdateEngineerInput } from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { engineersApi } from './api';

export const engineerKeys = {
  all: ['engineers'] as const,
  list: (query: EngineerListQuery) => [...engineerKeys.all, query] as const,
};

export function useEngineers(query: EngineerListQuery = {}) {
  return useQuery({ queryKey: engineerKeys.list(query), queryFn: () => engineersApi.list(query) });
}

function useEngineersMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: engineerKeys.all }),
  });
}

export const useCreateEngineer = () => useEngineersMutation(engineersApi.create);
export const useUpdateEngineer = () =>
  useEngineersMutation(({ id, input }: { id: string; input: UpdateEngineerInput }) =>
    engineersApi.update(id, input),
  );
