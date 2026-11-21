import { useEffect } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { notifyError } from '@/shared/lib/notify';
import { IconButton } from '../IconButton';

/** One notification per failure: a remount (StrictMode, a tab switched back) does not repeat it. */
const notified = new WeakSet<object>();

/** Says once, by a notification, that loading failed. */
function useErrorNotification(error: unknown) {
  useEffect(() => {
    if (!error) return;
    if (typeof error === 'object') {
      if (notified.has(error)) return;
      notified.add(error);
    }
    notifyError(toApiError(error).message);
  }, [error]);
}

type Props = {
  error: unknown;
  /** Loads again; without it nothing stays on the page. */
  onRetry?: () => void;
};

/**
 * Where data failed to load (2026-11-19): the reason goes to a notification, like every other
 * message, and the place keeps only «Повторити», so the page is not left without a way on.
 */
export function LoadFailed({ error, onRetry }: Props) {
  useErrorNotification(error);
  if (!onRetry) return null;
  return (
    <p>
      <IconButton icon="restore" label="Повторити" onClick={onRetry} />
    </p>
  );
}
