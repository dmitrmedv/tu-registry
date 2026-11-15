import { describe, expect, it } from 'vitest';
import { createApplicationSchema } from './application';

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

  it.each(['customer', 'customerRepresentative', 'phone', 'objectAddress', 'objectType'])(
    'requires %s',
    (field) => {
      const result = createApplicationSchema.safeParse({ ...valid, [field]: '' });
      expect(result.success).toBe(false);
    },
  );

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
