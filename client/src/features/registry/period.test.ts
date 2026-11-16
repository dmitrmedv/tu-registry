import { describe, expect, it } from 'vitest';
import { kyivToday, periodChoice, presetPeriod } from './period';

describe('registry period', () => {
  it('takes today from Kyiv, not from the browser or UTC', () => {
    expect(kyivToday(new Date('2026-03-15T21:59:00Z'))).toBe('2026-03-15');
    expect(kyivToday(new Date('2026-03-15T22:00:00Z'))).toBe('2026-03-16');
  });

  it.each([
    ['today', '2026-03-18', { from: '2026-03-18', to: '2026-03-18' }],
    // Wednesday → Monday of that week; Monday stays itself; Sunday goes back six days.
    ['week', '2026-03-18', { from: '2026-03-16', to: '' }],
    ['week', '2026-03-16', { from: '2026-03-16', to: '' }],
    ['week', '2026-03-22', { from: '2026-03-16', to: '' }],
    ['week', '2026-01-01', { from: '2025-12-29', to: '' }],
    ['month', '2026-03-18', { from: '2026-03-01', to: '' }],
    ['year', '2026-03-18', { from: '2026-01-01', to: '' }],
  ] as const)('%s on %s', (preset, today, expected) => {
    expect(presetPeriod(preset, today)).toEqual(expected);
  });

  it('names a period by what it means today', () => {
    expect(periodChoice({ from: '', to: '' }, '2026-03-18')).toBe('');
    expect(periodChoice({ from: '2026-03-16', to: '' }, '2026-03-18')).toBe('week');
    // Last week's link is no longer "this week".
    expect(periodChoice({ from: '2026-03-16', to: '' }, '2026-03-23')).toBe('custom');
    expect(periodChoice({ from: '', to: '2026-03-01' }, '2026-03-18')).toBe('custom');
  });
});
