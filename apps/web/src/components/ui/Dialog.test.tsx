import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function renderDialog(open: boolean, onClose = vi.fn()) {
  const view = render(
    <Dialog open={open} onClose={onClose} title="Example">
      <input aria-label="First field" />
    </Dialog>,
  );
  return { ...view, onClose, dialog: () => view.container.querySelector('dialog')! };
}

describe('Dialog', () => {
  it('is labelled by its title and focuses the first field when opened', () => {
    renderDialog(true);
    expect(screen.getByRole('dialog', { name: 'Example' })).toBeInTheDocument();
    expect(screen.getByLabelText('First field')).toHaveFocus();
  });

  it('reports Escape (cancel) and the close button as user closes', async () => {
    const { onClose, dialog } = renderDialog(true);
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not report a close it triggered itself', () => {
    const onClose = vi.fn();
    const { rerender } = renderDialog(true, onClose);
    rerender(
      <Dialog open={false} onClose={onClose} title="Example">
        <input aria-label="First field" />
      </Dialog>,
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores a stale close event that arrives after reopening (Escape → reopen race)', () => {
    const { onClose, dialog } = renderDialog(true);
    // The browser dispatches "close" asynchronously; here it lands while the dialog is open again.
    dialog().dispatchEvent(new Event('close'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
