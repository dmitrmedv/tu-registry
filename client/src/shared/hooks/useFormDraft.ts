import { useCallback, useState } from 'react';
import { clearDraft, loadDraft, saveDraft } from '@/shared/lib/draftStorage';

function equalsDefaults<T extends Record<string, unknown>>(values: T, defaults: T) {
  return (Object.keys(defaults) as (keyof T)[]).every((key) => values[key] === defaults[key]);
}

/**
 * Restores a form's unsaved draft on mount and persists every change.
 * Feed `save` from react-hook-form's `watch(callback)`; call `clear` after a successful save.
 */
export function useFormDraft<T extends Record<string, unknown>>(key: string, defaults: T) {
  // Read once: the restored values become the form's defaultValues.
  const [restored] = useState(() => loadDraft(key, defaults));

  const save = useCallback(
    (values: T) => {
      // An untouched form is not a draft.
      if (equalsDefaults(values, defaults)) clearDraft(key);
      else saveDraft(key, values);
    },
    [key, defaults],
  );
  const clear = useCallback(() => clearDraft(key), [key]);

  return {
    initialValues: restored?.values ?? defaults,
    restoredAt: restored?.savedAt ?? null,
    save,
    clear,
  };
}
