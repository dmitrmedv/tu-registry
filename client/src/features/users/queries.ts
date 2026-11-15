import type { UpdateUserInput } from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from './api';

export const userKeys = { all: ['users'] as const };

export function useUsers() {
  return useQuery({ queryKey: userKeys.all, queryFn: usersApi.list });
}

function useUsersMutation<TVariables, TResult>(fn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export const useCreateUser = () => useUsersMutation(usersApi.create);

export const useUpdateUser = () =>
  useUsersMutation(({ id, input }: { id: string; input: UpdateUserInput }) =>
    usersApi.update(id, input),
  );

export const useResetPassword = () => useUsersMutation(usersApi.resetPassword);
