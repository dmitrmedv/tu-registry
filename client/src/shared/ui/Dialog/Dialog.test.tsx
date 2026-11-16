import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

/** The dialog's box on screen: 100–500 × 100–400 (jsdom lays nothing out by itself). */
function openDialog() {
  const onClose = vi.fn();
  render(
    <Dialog open title="Перевірка" onClose={onClose} footer={<button type="button">Ок</button>}>
      <input aria-label="Поле" />
    </Dialog>,
  );
  const dialog = screen.getByRole('dialog', { name: 'Перевірка' });
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 100, y: 100, width: 400, height: 300 }),
  );
  return { dialog, onClose };
}

const press = (target: Element, at: { clientX: number; clientY: number }) =>
  fireEvent.pointerDown(target, at);
const release = (target: Element, at: { clientX: number; clientY: number }) =>
  fireEvent.click(target, at);

describe('Dialog', () => {
  it('closes on a click on the backdrop', () => {
    const { dialog, onClose } = openDialog();
    const outside = { clientX: 20, clientY: 20 };

    press(dialog, outside);
    release(dialog, outside);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open for clicks inside, on its own scrollbar, or a drag that ends outside', () => {
    const { dialog, onClose } = openDialog();
    const field = screen.getByLabelText('Поле');

    press(field, { clientX: 200, clientY: 200 });
    release(field, { clientX: 200, clientY: 200 });
    // The dialog element itself, but within its box: its scrollbar or padding.
    press(dialog, { clientX: 495, clientY: 200 });
    release(dialog, { clientX: 495, clientY: 200 });
    // Selecting text in the field and letting go over the backdrop.
    press(field, { clientX: 200, clientY: 200 });
    release(dialog, { clientX: 20, clientY: 20 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Esc', () => {
    const { dialog, onClose } = openDialog();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
