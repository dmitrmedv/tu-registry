import type { ApplicationChangeDto, ApplicationDto } from '@tu-registry/shared';

/** A realistic application as the API returns it; override what a test cares about. */
export function makeApplication(overrides: Partial<ApplicationDto> = {}): ApplicationDto {
  return {
    id: 'app00000000000000000001',
    regNumber: '14т/26-8',
    regYear: 2026,
    regSeq: 14,
    regDate: '2026-03-12',
    department: 'ODESA',
    customer: 'ТОВ «Приклад»',
    customerRepresentative: 'Петренко Іван',
    phone: '+380671234567',
    email: 'office@example.ua',
    settlement: 'м. Київ',
    objectAddress: 'вул. Прикладна, 1',
    areaType: 'URBAN',
    objectType: 'DOMESTIC',
    objectCategory: 'RESIDENTIAL_HOUSE',
    objectCategoryOther: null,
    comment: null,
    registrationMode: 'AUTO',
    status: 'ACTIVE',
    createdBy: { id: 'owner000000000000000001', fullName: 'Олена Коваль' },
    annulment: null,
    scan: null,
    createdAt: '2026-03-12T09:00:00.000Z',
    updatedAt: '2026-03-12T09:00:00.000Z',
    version: 3,
    ...overrides,
  };
}

/** A small but real-looking PDF file, as the browser hands it over. */
export function makePdf(name = 'Скан заяви.pdf', size?: number) {
  const file = new File(['%PDF-1.4\n%%EOF\n'], name, { type: 'application/pdf' });
  // jsdom keeps the content in memory: fake the size instead of allocating 50 MB.
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

export function makeChange(overrides: Partial<ApplicationChangeDto> = {}): ApplicationChangeDto {
  return {
    id: 'chg1',
    action: 'CREATED',
    changedAt: '2026-03-12T09:00:00.000Z',
    changedBy: { id: 'owner000000000000000001', fullName: 'Олена Коваль' },
    changes: [],
    ...overrides,
  };
}
