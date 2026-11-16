import type {
  ApplicationChangeDto,
  ApplicationDto,
  ProcessingDto,
  ResponseDto,
  TechnicalConditionsDto,
} from '@tu-registry/shared';

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
    stage: 'REGISTERED',
    deadlinesTracked: true,
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

export function makeResponse(overrides: Partial<ResponseDto> = {}): ResponseDto {
  return {
    id: 'resp0000000000000000001',
    applicationId: 'app00000000000000000001',
    outgoingNumber: '125/01-15',
    responseDate: '2026-03-16',
    engineer: { id: 'e00000000000000000000001', fullName: 'Бойко Андрій' },
    documentsReceivedAt: null,
    workingDays: 2,
    scan: null,
    previousScans: [],
    cancellation: null,
    createdBy: { id: 'owner000000000000000001', fullName: 'Олена Коваль' },
    createdAt: '2026-03-16T09:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

export function makeTechnicalConditions(
  overrides: Partial<TechnicalConditionsDto> = {},
): TechnicalConditionsDto {
  return {
    id: 'tu000000000000000000001',
    applicationId: 'app00000000000000000001',
    tuNumber: '0032/ТУ',
    preparedDate: '2026-03-20',
    engineer: { id: 'e00000000000000000000001', fullName: 'Бойко Андрій' },
    gasFlow: 2.5,
    connectionType: 'STANDARD',
    gasPressure: 'LOW',
    connectionPoint: 'UNDERGROUND',
    workingDays: 6,
    scan: null,
    previousScans: [],
    cancellation: null,
    createdBy: { id: 'owner000000000000000001', fullName: 'Олена Коваль' },
    createdAt: '2026-03-20T09:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

/** A freshly registered application's processing: nothing yet, both terms running. */
export function makeProcessing(overrides: Partial<ProcessingDto> = {}): ProcessingDto {
  return {
    stage: 'REGISTERED',
    deadlines: {
      tracked: true,
      response: {
        norm: 5,
        used: 0,
        remaining: 5,
        dueDate: '2026-03-19',
        overdueBy: 0,
        done: false,
      },
      tu: { norm: 10, used: 0, remaining: 10, dueDate: '2026-03-26', overdueBy: 0, done: false },
    },
    events: [
      {
        type: 'REGISTERED',
        date: '2026-03-12',
        number: '14т/26-8',
        person: 'Олена Коваль',
        documentId: null,
        scanName: null,
        workingDays: 0,
        norm: null,
        overdueBy: 0,
        sinceDocumentsReceived: null,
        cancelled: false,
      },
    ],
    ...overrides,
  };
}
