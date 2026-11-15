/**
 * Unsaved form drafts in localStorage, so a page reload does not lose typed data.
 * Drafts hold customer data, so they are scoped per user, expire, and are removed on
 * successful save and on logout. Storage may be unavailable (private mode, blocked site
 * data): every access is guarded and the form simply works without drafts.
 */

const PREFIX = 'tu-registry:draft:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredDraft = { savedAt: string; values: Record<string, unknown> };

export type Draft<T> = { values: T; savedAt: string };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps only known fields whose type matches the defaults (ignores tampered data). */
function sanitize<T extends Record<string, unknown>>(stored: Record<string, unknown>, defaults: T) {
  const values = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = stored[key as string];
    if (typeof value === typeof defaults[key]) values[key] = value as T[keyof T];
  }
  return values;
}

export function loadDraft<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): Draft<T> | null {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<StoredDraft>;
    const savedAt = Date.parse(draft.savedAt ?? '');
    if (!draft.values || typeof draft.values !== 'object' || Number.isNaN(savedAt)) {
      clearDraft(key);
      return null;
    }
    if (Date.now() - savedAt > MAX_AGE_MS) {
      clearDraft(key);
      return null;
    }
    return { values: sanitize(draft.values, defaults), savedAt: draft.savedAt! };
  } catch {
    return null;
  }
}

export function saveDraft(key: string, values: Record<string, unknown>) {
  try {
    const draft: StoredDraft = { savedAt: new Date().toISOString(), values };
    storage()?.setItem(PREFIX + key, JSON.stringify(draft));
  } catch {
    // Quota exceeded or storage blocked: drafts are a convenience, not a requirement.
  }
}

export function clearDraft(key: string) {
  try {
    storage()?.removeItem(PREFIX + key);
  } catch {
    // Ignore: nothing to clean up if storage is unavailable.
  }
}

/** Removes every draft on this device (called on logout). */
export function clearAllDrafts() {
  try {
    const store = storage();
    if (!store) return;
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
    for (const key of keys) if (key?.startsWith(PREFIX)) store.removeItem(key);
  } catch {
    // Ignore, see clearDraft.
  }
}
