import { describe, expect, it } from 'vitest';
import { createDepartmentSchema, departmentField, updateDepartmentSchema } from './departments';

describe('department schemas', () => {
  it('trims the name and accepts the code as a number or digits', () => {
    expect(createDepartmentSchema.parse({ name: ' Нове ', code: '15' })).toEqual({
      name: 'Нове',
      code: 15,
    });
  });

  it.each([
    [{ name: 'Н', code: 15 }, 'name'],
    [{ name: 'Нове', code: 0 }, 'code'],
    [{ name: 'Нове', code: 1000 }, 'code'],
    [{ name: 'Нове', code: 1.5 }, 'code'],
    [{ name: 'Нове', code: '' }, 'code'],
  ])('rejects %j', (input, field) => {
    const result = createDepartmentSchema.safeParse(input);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it('needs at least one change in an update', () => {
    expect(updateDepartmentSchema.safeParse({}).success).toBe(false);
    expect(updateDepartmentSchema.parse({ code: 18 })).toEqual({ code: 18 });
  });

  it('accepts ids of the initial and of generated departments, nothing else', () => {
    expect(departmentField.parse('ODESA')).toBe('ODESA');
    expect(departmentField.parse('6af9e16570558c9168543cdb')).toBe('6af9e16570558c9168543cdb');
    expect(departmentField.safeParse('').error?.issues[0]?.message).toBe('Оберіть управління');
    expect(departmentField.safeParse('ODESA; drop').success).toBe(false);
  });
});
