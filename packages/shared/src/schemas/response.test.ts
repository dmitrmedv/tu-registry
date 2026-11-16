import { describe, expect, it } from 'vitest';
import {
  cancelDocumentSchema,
  createResponseSchema,
  documentScanQuerySchema,
  updateResponseSchema,
} from './response';

const ENGINEER = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('response schemas', () => {
  it('takes a trimmed number, a date and an engineer', () => {
    expect(
      createResponseSchema.parse({
        outgoingNumber: ' 125/01-15 ',
        responseDate: '2026-11-06',
        engineer: ENGINEER,
      }),
    ).toEqual({ outgoingNumber: '125/01-15', responseDate: '2026-11-06', engineer: ENGINEER });
  });

  it.each([
    { outgoingNumber: '', responseDate: '2026-11-06', engineer: ENGINEER },
    { outgoingNumber: '1'.repeat(51), responseDate: '2026-11-06', engineer: ENGINEER },
    { outgoingNumber: '125', responseDate: '06.11.2026', engineer: ENGINEER },
    { outgoingNumber: '125', responseDate: '2026-11-06', engineer: 'Бойко' },
    { outgoingNumber: '125', responseDate: '2026-11-06', engineer: ENGINEER, scan: 'x' },
  ])('rejects %j', (input) => {
    expect(createResponseSchema.safeParse(input).success).toBe(false);
  });

  it('edits any field with the version seen; the documents date may be cleared', () => {
    expect(updateResponseSchema.parse({ version: 2, documentsReceivedAt: null })).toEqual({
      version: 2,
      documentsReceivedAt: null,
    });
    expect(updateResponseSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(updateResponseSchema.safeParse({ outgoingNumber: '1' }).success).toBe(false);
  });

  it('cancels with a reason', () => {
    expect(cancelDocumentSchema.safeParse({ reason: ' ', version: 1 }).success).toBe(false);
    expect(cancelDocumentSchema.parse({ reason: ' Помилка ', version: 1 }).reason).toBe('Помилка');
  });

  it('opens an earlier scan by its id only', () => {
    expect(
      documentScanQuerySchema.parse({ file: '0d4c7a52-6a35-4f5e-9f7a-1c2b3d4e5f60' }).file,
    ).toBeDefined();
    expect(documentScanQuerySchema.safeParse({ file: '../../etc/passwd' }).success).toBe(false);
  });
});
