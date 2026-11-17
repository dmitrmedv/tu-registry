import clsx from 'clsx';
import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';
import styles from './Tabs.module.scss';

export type TabItem<Id extends string> = { id: Id; label: string };

type Props<Id extends string> = {
  /** The name of the tab list for screen readers. */
  label: string;
  tabs: TabItem<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
  /** The selected tab's content. */
  children: ReactNode;
  /** E.g. a fixed height, so that every tab looks the same. */
  panelClassName?: string;
};

/**
 * Tabs (WAI-ARIA "tabs", automatic activation): ←/→ move to the next tab and open it, Home/End
 * to the first and last; only the selected tab is in the Tab order, then its panel.
 */
export function Tabs<Id extends string>({
  label,
  tabs,
  selected,
  onSelect,
  children,
  panelClassName,
}: Props<Id>) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const tabId = (id: Id) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((tab) => tab.id === selected);
    const next = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length]!;
    onSelect(tab.id);
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(tab.id))}`)?.focus();
  };

  return (
    <div className={styles.tabs}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className={styles.list}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected ? 0 : -1}
              className={clsx(styles.tab, isSelected && styles.selected)}
              onClick={() => onSelect(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(selected)}
        tabIndex={0}
        className={clsx(styles.panel, panelClassName)}
      >
        {children}
      </div>
    </div>
  );
}
