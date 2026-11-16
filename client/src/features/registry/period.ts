/** Registration dates are Kyiv calendar dates, so "today" is Kyiv's, wherever the browser is. */
export function kyivToday(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(now);
}

export const PERIOD_PRESETS = ['today', 'week', 'month', 'year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
/** '' — any time; 'custom' — dates chosen by hand. */
export type PeriodChoice = '' | PeriodPreset | 'custom';

export const PERIOD_LABELS: Record<PeriodChoice, string> = {
  '': 'Будь-коли',
  today: 'Сьогодні',
  week: 'Цей тиждень',
  month: 'Цей місяць',
  year: 'Цей рік',
  custom: 'Довільний…',
};

type Period = { from: string; to: string };

/** Week, month and year run to today, so they are left open-ended. */
export function presetPeriod(preset: PeriodPreset, today: string): Period {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: '' };
  if (preset === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: '' };
  // Pure calendar arithmetic in UTC: the date string is already Kyiv's.
  const date = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - sinceMonday);
  return { from: date.toISOString().slice(0, 10), to: '' };
}

/** Which choice a period in the URL is: a preset only while it still means that today. */
export function periodChoice({ from, to }: Period, today: string): PeriodChoice {
  if (!from && !to) return '';
  const preset = PERIOD_PRESETS.find((p) => {
    const period = presetPeriod(p, today);
    return period.from === from && period.to === to;
  });
  return preset ?? 'custom';
}
