import { describe, expect, it } from 'vitest';
import { workingDaysLabel } from './format';

describe('workingDaysLabel', () => {
  it.each([
    [0, '0 робочих днів'],
    [1, '1 робочий день'],
    [4, '4 робочі дні'],
    [5, '5 робочих днів'],
    [11, '11 робочих днів'],
    [12, '12 робочих днів'],
    [21, '21 робочий день'],
    [22, '22 робочі дні'],
    [111, '111 робочих днів'],
  ])('%i → %s', (n, label) => {
    expect(workingDaysLabel(n)).toBe(label);
  });
});
