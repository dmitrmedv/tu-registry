import { useId } from 'react';

/** Ids that tie a control to its hint and error text for screen readers. */
export function useFieldIds(id: string | undefined, hasHint: boolean, hasError: boolean) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hasHint ? `${controlId}-hint` : undefined;
  const errorId = hasError ? `${controlId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return { controlId, hintId, errorId, describedBy };
}
