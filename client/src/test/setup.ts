import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { tokenStore } from '@/shared/api/tokenStore';
import { server } from './server';

// jsdom does not implement modal dialogs; emulate the parts our Dialog relies on.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

// jsdom's Blob has no text() (every browser does); the scan request reads its error body with it.
if (!Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom has no layout or scrolling; the registry scrolls to the top when the page changes.
window.scrollTo = vi.fn() as typeof window.scrollTo;

// Any request without a handler fails the test instead of silently hitting the network.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  tokenStore.set(null);
  // Form drafts must not leak from one test into the next.
  localStorage.clear();
  // Notifications live in <body>, outside what cleanup() removes.
  document
    .querySelectorAll('#NotiflixNotifyWrap, #NotiflixNotifyOverlay')
    .forEach((element) => element.remove());
});

afterAll(() => server.close());
