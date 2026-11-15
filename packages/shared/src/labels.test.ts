import { describe, expect, it } from 'vitest';
import { AREA_TYPE_LABELS, codesByLabel, OBJECT_CATEGORY_LABELS } from './labels';

describe('codesByLabel', () => {
  it('orders codes by their Ukrainian names', () => {
    expect(codesByLabel(OBJECT_CATEGORY_LABELS)).toEqual([
      'BIOGAS_PRODUCER', // Виробник біогазу
      'RESIDENTIAL_HOUSE', // Житловий будинок
      'LAND_PLOT', // Земельна ділянка
      'OTHER', // Інше
      'APARTMENT', // Квартира
      'NON_RESIDENTIAL', // Нежитлове приміщення
    ]);
    expect(codesByLabel(AREA_TYPE_LABELS)).toEqual(['URBAN', 'RURAL']);
  });
});
