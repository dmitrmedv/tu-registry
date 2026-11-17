import { describe, expect, it } from 'vitest';
import { shortName } from './format';

describe('shortName', () => {
  it.each([
    ['Гук Олег Вікторович', 'Гук О.В.'],
    ['  Бойко   Андрій ', 'Бойко А.'],
    ['Ткач', 'Ткач'],
    ['Шевченко-Коваль ірина Петрівна', 'Шевченко-Коваль І.П.'],
    ['Гук О.В.', 'Гук О.В.'],
    ['Гук О. В.', 'Гук О.В.'],
    ['Гук Олег В.', 'Гук О.В.'],
  ])('%s → %s', (fullName, short) => {
    expect(shortName(fullName)).toBe(short);
  });
});
