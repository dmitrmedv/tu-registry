import type {
  CancelDocumentInput,
  CreateProjectInput,
  UpdateProjectInput,
} from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi as api } from './api';

/** Under the application's key: whatever refreshes the application refreshes these too. */
export const projectsKeys = {
  list: (applicationId: string) => ['applications', applicationId, 'projects'] as const,
};

export function useProjects(applicationId: string) {
  return useQuery({
    queryKey: projectsKeys.list(applicationId),
    queryFn: () => api.list(applicationId),
  });
}

function useProjectMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The application's timeline and history follow its documents.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export const useCreateProject = (applicationId: string) =>
  useProjectMutation((input: CreateProjectInput) => api.create(applicationId, input));

export const useUpdateProject = (applicationId: string) =>
  useProjectMutation(({ id, input }: { id: string; input: UpdateProjectInput }) =>
    api.update(applicationId, id, input),
  );

export const useCancelProject = (applicationId: string) =>
  useProjectMutation(({ id, input }: { id: string; input: CancelDocumentInput }) =>
    api.cancel(applicationId, id, input),
  );

export const useRestoreProject = (applicationId: string) =>
  useProjectMutation(({ id, version }: { id: string; version: number }) =>
    api.restore(applicationId, id, version),
  );

export const useDeleteProject = (applicationId: string) =>
  useProjectMutation(({ id, version }: { id: string; version: number }) =>
    api.remove(applicationId, id, version),
  );

export const useUploadProjectScan = (applicationId: string) =>
  useProjectMutation(
    ({ id, file, onProgress }: { id: string; file: File; onProgress?: (p: number) => void }) =>
      api.uploadScan(applicationId, id, file, onProgress),
  );

export const useRemoveProjectScan = (applicationId: string) =>
  useProjectMutation((id: string) => api.removeScan(applicationId, id));
