import { describe, expect, it } from 'vitest';
import { formatFileSize, SCAN_MAX_BYTES } from './scan';

describe('formatFileSize', () => {
  it.each([
    [500, '1 КБ'],
    [850 * 1024, '850 КБ'],
    [12.4 * 1024 * 1024, '12,4 МБ'],
    [SCAN_MAX_BYTES, '50,0 МБ'],
  ])('%i bytes → %s', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });
});
