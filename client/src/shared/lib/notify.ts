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

/**
 * Every success message — added, saved, changed, cancelled, deleted, copied (2026-11-19) — is
 * this notification in the corner of the screen, gone after NOTIFY_TIMEOUT_MS, also over an
 * open dialog. It outlives the component that raised it, so it can be shown right before a
 * navigation. Errors stay in an `Alert` next to what failed.
 */
export function notifySuccess(message: string) {
  Notify.success(message);
  raiseAboveDialogs();
  // Notiflix sets no ARIA: an inserted alert is what screen readers announce reliably.
  for (const toast of document.querySelectorAll('.notiflix-notify:not([role])')) {
    toast.setAttribute('role', 'alert');
  }
}
