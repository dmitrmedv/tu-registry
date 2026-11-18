import styles from './Icon.module.scss';

// Simple 24×24 outline icons drawn with the text colour; a few shapes do not justify a library.
const PATHS = {
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  pencil: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z M14 6l4 4',
  ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M5.6 5.6l12.8 12.8',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative: the button or link next to it carries the accessible name. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
