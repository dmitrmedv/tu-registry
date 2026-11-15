import type { Department, UpdateDepartmentInput } from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { departmentsApi } from './api';

export const departmentKeys = { all: ['departments'] as const };

/** The list rarely changes; an admin's edits refresh it (and numbers that carry its codes). */
export function useDepartmentList() {
  return useQuery({
    queryKey: departmentKeys.all,
    queryFn: departmentsApi.list,
    staleTime: 5 * 60 * 1000,
  });
}

export type DepartmentOption = { value: Department; label: string };

/**
 * Names, codes and select options of the departments. While the list loads, names are empty
 * strings and codes undefined: callers render without them rather than wait.
 */
export function useDepartments() {
  const query = useDepartmentList();
  return useMemo(() => {
    const list = query.data ?? [];
    const byId = new Map(list.map((department) => [department.id, department]));
    const label = (id: Department) => {
      const department = byId.get(id);
      return department ? `${department.name}${department.archived ? ' (архів)' : ''}` : '';
    };
    return {
      list,
      isPending: query.isPending,
      nameOf: (id: Department) => byId.get(id)?.name ?? '',
      codeOf: (id: Department) => byId.get(id)?.code,
      /** Where something new may go: departments not in the archive. */
      activeOptions: list
        .filter((department) => !department.archived)
        .map((department) => ({ value: department.id, label: department.name })),
      /**
       * For choosing an existing value: active departments, plus `current` if it is archived
       * (so a user of an archived department still shows their own).
       */
      optionsWith: (current?: Department): DepartmentOption[] =>
        list
          .filter((department) => !department.archived || department.id === current)
          .map((department) => ({ value: department.id, label: label(department.id) })),
      /** Every department, archived ones marked: for filters over existing data. */
      allOptions: list.map((department) => ({ value: department.id, label: label(department.id) })),
    };
  }, [query.data, query.isPending]);
}

function useDepartmentsMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      // Names and codes appear in numbers, registry rows and cards.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: departmentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
      ]);
    },
  });
}

export const useCreateDepartment = () => useDepartmentsMutation(departmentsApi.create);
export const useUpdateDepartment = () =>
  useDepartmentsMutation(({ id, input }: { id: Department; input: UpdateDepartmentInput }) =>
    departmentsApi.update(id, input),
  );
export const useArchiveDepartment = () => useDepartmentsMutation(departmentsApi.archive);
export const useRestoreDepartment = () => useDepartmentsMutation(departmentsApi.restore);
export const useDeleteDepartment = () => useDepartmentsMutation(departmentsApi.remove);
