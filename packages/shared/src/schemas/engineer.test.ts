import { describe, expect, it } from 'vitest';
import { createEngineerSchema, engineerListQuerySchema, updateEngineerSchema } from './engineer';

describe('engineer schemas', () => {
  it('takes a trimmed full name and a department', () => {
    expect(createEngineerSchema.parse({ fullName: ' Бойко Андрій ', department: 'RENI' })).toEqual({
      fullName: 'Бойко Андрій',
      department: 'RENI',
    });
  });

  it.each([
    { fullName: 'Б', department: 'RENI' },
    { fullName: 'Бойко Андрій' },
    { fullName: 'Бойко Андрій', department: 'RENI', isActive: false },
  ])('rejects a new engineer %j', (input) => {
    expect(createEngineerSchema.safeParse(input).success).toBe(false);
  });

  it('changes the name or the status, never the department', () => {
    expect(updateEngineerSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(updateEngineerSchema.safeParse({}).success).toBe(false);
    expect(updateEngineerSchema.safeParse({ department: 'ODESA' }).success).toBe(false);
  });

  it('reads the list query, dropping empty values', () => {
    expect(engineerListQuerySchema.parse({ department: '', active: '' })).toEqual({});
    expect(engineerListQuerySchema.parse({ department: 'RENI', active: 'true' })).toEqual({
      department: 'RENI',
      active: 'true',
    });
    expect(engineerListQuerySchema.safeParse({ active: 'yes' }).success).toBe(false);
  });
});
