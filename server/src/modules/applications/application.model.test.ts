import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db';
import { Application } from './application.model';

// Tests deliberately pass invalid shapes to exercise runtime validation, hence the cast.
type ApplicationInput = Parameters<typeof Application.create>[0];

function validApplication(overrides: Record<string, unknown> = {}): ApplicationInput {
  return {
    regYear: 2026,
    regSeq: 1,
    regDate: new Date('2026-03-12T00:00:00Z'),
    customer: 'ТОВ «Приклад»',
    customerRepresentative: 'Петренко Іван',
    phone: '+380671234567',
    objectAddress: 'м. Київ, вул. Прикладна, 1',
    objectType: 'DOMESTIC',
    objectCategory: 'RESIDENTIAL_HOUSE',
    registrationMode: 'AUTO',
    createdBy: new Types.ObjectId(),
    ...overrides,
  } as ApplicationInput;
}

describe('Application model', () => {
  useTestDb();

  it('creates an application with defaults; email is optional', async () => {
    const app = await Application.create(validApplication());

    expect(app.status).toBe('ACTIVE');
    expect(app.version).toBe(1);
    expect(app.email).toBeUndefined();
    expect(app.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate number within the same year', async () => {
    await Application.create(validApplication());

    await expect(Application.create(validApplication())).rejects.toMatchObject({ code: 11000 });
  });

  it('allows the same sequence number in a different year', async () => {
    await Application.create(validApplication());

    await expect(
      Application.create(
        validApplication({ regYear: 2027, regDate: new Date('2027-01-01T00:00:00Z') }),
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a number whose year differs from the registration date year', async () => {
    await expect(Application.create(validApplication({ regYear: 2025 }))).rejects.toThrow(
      /Рік номера не відповідає/,
    );
  });

  it('rejects a registration date that is not a calendar date', async () => {
    await expect(
      Application.create(validApplication({ regDate: new Date('2026-03-12T10:30:00Z') })),
    ).rejects.toThrow(/calendar date/);
  });

  it('does not require a customer representative', async () => {
    const app = await Application.create(validApplication({ customerRepresentative: undefined }));
    expect(app.customerRepresentative).toBeUndefined();
  });

  it.each([['customer'], ['phone'], ['objectAddress'], ['objectType']])(
    'requires %s',
    async (field) => {
      await expect(Application.create(validApplication({ [field]: undefined }))).rejects.toThrow(
        field,
      );
    },
  );

  it('rejects a phone that is not normalized', async () => {
    await expect(Application.create(validApplication({ phone: '067 123 45 67' }))).rejects.toThrow(
      /phone/,
    );
  });

  it('rejects non-integer or non-positive sequence numbers', async () => {
    await expect(Application.create(validApplication({ regSeq: 0 }))).rejects.toThrow(/regSeq/);
    await expect(Application.create(validApplication({ regSeq: 1.5 }))).rejects.toThrow(/regSeq/);
  });
});
