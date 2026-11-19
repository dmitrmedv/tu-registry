import { Notify } from 'notiflix/build/notiflix-notify-aio';

/** How long a notification stays on screen (agreed 2026-11-17); hovering keeps it. */
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
 * An open modal <dialog> sits in the browser's top layer, above any z-index, so Notiflix's
 * container would hide under its backdrop. Shown as a manual popover it joins the top layer
 * too, and showing it again puts it on top of a dialog opened since. Its popover look is reset
 * in `global.scss` (`#NotiflixNotifyWrap`).
 */
function raiseAboveDialogs() {
  const wrap = document.getElementById('NotiflixNotifyWrap');
  if (!wrap || typeof wrap.showPopover !== 'function') return;
  if (!wrap.hasAttribute('popover')) wrap.setAttribute('popover', 'manual');
  if (wrap.matches(':popover-open')) wrap.hidePopover();
  wrap.showPopover();
}

function show(kind: 'success' | 'failure' | 'warning' | 'info', message: string) {
  Notify[kind](message);
  raiseAboveDialogs();
  // Notiflix sets no ARIA: an inserted alert is what screen readers announce reliably.
  for (const toast of document.querySelectorAll('.notiflix-notify:not([role])')) {
    toast.setAttribute('role', 'alert');
  }
}

/**
 * Every message about what just happened is a notification in the corner of the screen, in
 * one style across the app (2026-11-19): success — added, saved, changed, cancelled, deleted,
 * copied; errors of an action or of loading; warnings and notes such as «Змін немає». It is
 * gone after NOTIFY_TIMEOUT_MS, shows over an open dialog too, and outlives the component that
 * raised it, so it can be shown right before a navigation. What must stay in view (a hint with
 * a button or a link, the one-time password warning) stays an `Alert` on the page.
 */
export const notifySuccess = (message: string) => show('success', message);
export const notifyError = (message: string) => show('failure', message);
export const notifyWarning = (message: string) => show('warning', message);
export const notifyInfo = (message: string) => show('info', message);
