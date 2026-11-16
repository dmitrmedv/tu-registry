import type { Department } from '@tu-registry/shared';
import { useEngineers } from './queries';

/**
 * Engineers to choose in a document of `department`: the active ones, plus `currentId` (the
 * one already chosen) even if deactivated since — so editing other fields needs no new choice.
 */
export function useEngineerOptions(department: Department, currentId?: string) {
  const engineers = useEngineers({ department });
  const options = [
    { value: '', label: 'Оберіть інженера' },
    ...(engineers.data ?? [])
      .filter((engineer) => engineer.isActive || engineer.id === currentId)
      .map((engineer) => ({
        value: engineer.id,
        label: engineer.isActive ? engineer.fullName : `${engineer.fullName} (неактивний)`,
      })),
  ];
  return { query: engineers, options };
}
