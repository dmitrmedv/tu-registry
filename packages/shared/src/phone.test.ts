import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['0671234567', '+380671234567'],
    ['067 123 45 67', '+380671234567'],
    ['(067) 123-45-67', '+380671234567'],
    ['+38 (067) 123-45-67', '+380671234567'],
    ['380671234567', '+380671234567'],
    ['+380671234567', '+380671234567'],
    ['044 234 56 78', '+380442345678'],
  ])('normalizes %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    '',
    '12345',
    '067123456',
    '06712345678',
    '+0671234567',
    '+1 202 555 0100',
    '067-ABC-45-67',
  ])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('formatPhone', () => {
  it('groups digits for display', () => {
    expect(formatPhone('+380671234567')).toBe('+380 67 123 45 67');
  });
});
