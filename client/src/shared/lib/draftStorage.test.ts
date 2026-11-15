import { describe, expect, it } from 'vitest';
import { clearAllDrafts, clearDraft, loadDraft, saveDraft } from './draftStorage';

const defaults = { customer: '', manual: false };
const KEY = 'form:u1';
const STORAGE_KEY = `tu-registry:draft:${KEY}`;

describe('draftStorage', () => {
  it('saves and loads a draft with its timestamp', () => {
    saveDraft(KEY, { customer: 'ТОВ «Приклад»', manual: true });

    const draft = loadDraft(KEY, defaults);

    expect(draft?.values).toEqual({ customer: 'ТОВ «Приклад»', manual: true });
    expect(Date.parse(draft!.savedAt)).not.toBeNaN();
  });

  it('keeps only known fields of the expected type', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        values: { customer: 42, manual: true, injected: '<script>' },
      }),
    );

    expect(loadDraft(KEY, defaults)?.values).toEqual({ customer: '', manual: true });
  });

  it.each([
    ['corrupted JSON', '{not json'],
    ['a missing timestamp', JSON.stringify({ values: { customer: 'x' } })],
    ['missing values', JSON.stringify({ savedAt: new Date().toISOString() })],
  ])('ignores %s', (_case, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);

    expect(loadDraft(KEY, defaults)).toBeNull();
  });

  it('drops drafts older than 7 days', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: eightDaysAgo, values: {} }));

    expect(loadDraft(KEY, defaults)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears one draft or all drafts, leaving unrelated keys alone', () => {
    saveDraft(KEY, { customer: 'a' });
    saveDraft('other:u2', { customer: 'b' });
    localStorage.setItem('unrelated', 'keep');

    clearDraft(KEY);
    expect(loadDraft(KEY, defaults)).toBeNull();
    expect(loadDraft('other:u2', defaults)).not.toBeNull();

    clearAllDrafts();
    expect(loadDraft('other:u2', defaults)).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
