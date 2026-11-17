import { useCallback } from 'react';

/**
 * Publishes an element's height as a CSS variable on <html>, so sticky blocks below it can sit
 * right under it (e.g. --app-header-height). Kept up to date when the element wraps.
 * A callback ref: it starts whenever the element appears, also after a loading state.
 */
export function useHeightVariable<T extends HTMLElement>(name: `--${string}`) {
  return useCallback(
    (element: T | null) => {
      if (!element || typeof ResizeObserver === 'undefined') return;
      const root = document.documentElement;
      const observer = new ResizeObserver(() =>
        root.style.setProperty(name, `${element.offsetHeight}px`),
      );
      observer.observe(element);
      return () => {
        observer.disconnect();
        root.style.removeProperty(name);
      };
    },
    [name],
  );
}
