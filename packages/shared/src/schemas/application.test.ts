import { describe, expect, it } from 'vitest';
import { createApplicationSchema, manualApplicationSchema } from './application';

const valid = {
  customer: ' ТОВ «Приклад» ',
  customerRepresentative: 'Петренко Іван',
  phone: '067 123 45 67',
  email: ' Info@Example.UA ',
  objectAddress: 'м. Київ, вул. Прикладна, 1',
  objectType: 'DOMESTIC',
};

describe('createApplicationSchema', () => {
  it('trims text, normalizes phone and email', () => {
    expect(createApplicationSchema.parse(valid)).toEqual({
      ...valid,
      customer: 'ТОВ «Приклад»',
      phone: '+380671234567',
      email: 'info@example.ua',
    });
  });

  it('treats an empty or missing email as absent', () => {
    expect(createApplicationSchema.parse({ ...valid, email: '' }).email).toBeUndefined();
    const { email: _email, ...withoutEmail } = valid;
    expect(createApplicationSchema.parse(withoutEmail).email).toBeUndefined();
  });

  it('treats an empty or missing representative as absent', () => {
    expect(
      createApplicationSchema.parse({ ...valid, customerRepresentative: '  ' })
        .customerRepresentative,
    ).toBeUndefined();
    const { customerRepresentative: _r, ...withoutRepresentative } = valid;
    expect(createApplicationSchema.safeParse(withoutRepresentative).success).toBe(true);
  });

  it.each(['customer', 'phone', 'objectAddress', 'objectType'])('requires %s', (field) => {
    const result = createApplicationSchema.safeParse({ ...valid, [field]: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email and phone', () => {
    expect(createApplicationSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(
      false,
    );
    expect(createApplicationSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
  });

  it('rejects fields the client must not set', () => {
    for (const extra of [{ regSeq: 1 }, { registrationMode: 'MANUAL' }, { createdBy: 'x' }]) {
      expect(createApplicationSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
});

describe('manualApplicationSchema', () => {
  const schema = manualApplicationSchema('2026-03-12');
  const manual = { ...valid, regDate: '2024-05-20', regSeq: ' 0014 ' };

  it('takes the sequence as digits and keeps the calendar date', () => {
    const result = schema.parse(manual);
    expect(result.regSeq).toBe(14);
    expect(result.regDate).toBe('2024-05-20');
    expect(schema.parse({ ...manual, regSeq: 14 }).regSeq).toBe(14);
  });

  it('accepts today but not tomorrow', () => {
    expect(schema.safeParse({ ...manual, regDate: '2026-03-12' }).success).toBe(true);
    const future = schema.safeParse({ ...manual, regDate: '2026-03-13' });
    expect(future.error?.issues[0]?.message).toMatch(/не може бути пізнішою/);
  });

  it.each([
    ['regDate', '2024-02-30'],
    ['regDate', '20.05.2024'],
    ['regSeq', ''],
    ['regSeq', '0'],
    ['regSeq', '14т/24'],
    ['regSeq', '1.5'],
    ['regSeq', -3],
    ['regSeq', '1000000'],
  ])('rejects %s = %j', (field, value) => {
    expect(schema.safeParse({ ...manual, [field]: value }).success).toBe(false);
  });

  it('still rejects unknown fields', () => {
    expect(schema.safeParse({ ...manual, registrationMode: 'AUTO' }).success).toBe(false);
  });
  it.each([
    ['14т/24', 'Вкажіть порядковий номер (лише цифри)'],
    ['', 'Вкажіть порядковий номер'],
    ['0', 'Номер має бути більшим за нуль'],
    [undefined, 'Вкажіть порядковий номер'],
  ])('explains what is wrong with regSeq = %j', (value, message) => {
    const result = schema.safeParse({ ...manual, regSeq: value });
    expect(result.error?.issues.map((i) => i.message)).toEqual([message]);
  });
});
