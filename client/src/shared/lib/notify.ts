import { Notify } from 'notiflix/build/notiflix-notify-aio';

/** How long a «saved / changed» notification stays on screen (agreed 2026-11-17). */
export const NOTIFY_TIMEOUT_MS = 5000;

Notify.init({
  position: 'right-top',
  distance: '16px',
  timeout: NOTIFY_TIMEOUT_MS,
  clickToClose: true,
  pauseOnHover: true,
  // Messages hold our own text plus numbers people typed: never parsed as HTML.
  plainText: true,
  fontFamily: 'inherit',
  fontSize: '15px',
  width: '360px',
  cssAnimationStyle: 'from-right',
});

/**
 * A short success notification («Зміни збережено», «Відповідь № 125 додано») in the corner of
 * the screen, gone after NOTIFY_TIMEOUT_MS. It outlives the component that raised it, so it can
 * be shown right before a navigation. Results people must read (a new number) stay in a plain
 * Alert on the page. Not for messages inside an open modal dialog: the dialog's backdrop
 * covers anything outside it.
 */
export function notifySuccess(message: string) {
  Notify.success(message);
  // Notiflix sets no ARIA: an inserted alert is what screen readers announce reliably.
  for (const toast of document.querySelectorAll('.notiflix-notify:not([role])')) {
    toast.setAttribute('role', 'alert');
  }
}
