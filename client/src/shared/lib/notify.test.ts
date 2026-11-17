import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFY_TIMEOUT_MS, notifySuccess } from './notify';

describe('notifySuccess', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('announces the message and takes it away after a while', async () => {
    notifySuccess('Зміни збережено');
    expect(screen.getByRole('alert')).toHaveTextContent('Зміни збережено');

    await vi.advanceTimersByTimeAsync(NOTIFY_TIMEOUT_MS - 100);
    expect(screen.getByText('Зміни збережено')).toBeInTheDocument();
    // The fade-out takes a moment after the timeout.
    await vi.advanceTimersByTimeAsync(1000);
    expect(screen.queryByText('Зміни збережено')).toBeNull();
  });

  it('never renders markup from a message (Notiflix drops the tags)', () => {
    notifySuccess('<b>Відповідь</b> № 1');
    expect(screen.getByRole('alert')).toHaveTextContent('Відповідь № 1');
    expect(document.querySelector('.notiflix-notify b')).toBeNull();
  });
});
