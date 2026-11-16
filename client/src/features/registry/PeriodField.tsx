import { useState } from 'react';
import { SelectField, TextField } from '@/shared/ui';
import { kyivToday, PERIOD_LABELS, type PeriodChoice, periodChoice, presetPeriod } from './period';
import styles from './registry.module.scss';

type Props = {
  from: string;
  to: string;
  /** Wrong order: shown on the end date (the end is ignored until fixed). */
  error?: string;
  onChange: (period: { from?: string; to?: string }) => void;
};

const OPTIONS = (Object.keys(PERIOD_LABELS) as PeriodChoice[]).map((value) => ({
  value,
  label: PERIOD_LABELS[value],
}));

/** Registration period: a ready choice, or two dates for any other range. */
export function PeriodField({ from, to, error, onChange }: Props) {
  const today = kyivToday();
  const fromUrl = periodChoice({ from, to }, today);
  // "Довільний…" keeps the date inputs open while they are being filled, even when the dates
  // happen to match a preset or are still empty.
  const [customChosen, setCustomChosen] = useState(false);
  // Both dates cleared from outside (reset, browser Back) closes them again; clearing them in
  // the inputs themselves does not.
  const [seen, setSeen] = useState(`${from}|${to}`);
  const [typed, setTyped] = useState(false);
  if (seen !== `${from}|${to}`) {
    setSeen(`${from}|${to}`);
    setTyped(false);
    if (!from && !to && !typed) setCustomChosen(false);
  }
  const typeDate = (period: { from?: string; to?: string }) => {
    setTyped(true);
    onChange(period);
  };
  const choice = customChosen ? 'custom' : fromUrl;

  const choose = (value: PeriodChoice) => {
    setCustomChosen(value === 'custom');
    if (value === '') onChange({ from: '', to: '' });
    else if (value !== 'custom') onChange(presetPeriod(value, today));
  };

  return (
    <div className={styles.period}>
      <SelectField
        label="Період"
        options={OPTIONS}
        value={choice}
        onChange={(e) => choose(e.target.value as PeriodChoice)}
      />
      {choice === 'custom' && (
        <>
          <TextField
            label="Дата з"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => typeDate({ from: e.target.value })}
          />
          <TextField
            label="Дата по"
            type="date"
            value={to}
            min={from || undefined}
            error={error}
            onChange={(e) => typeDate({ to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
