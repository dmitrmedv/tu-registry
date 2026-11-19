import type { ReactNode } from 'react';
import { Button } from '../Button';
import { Dialog } from './Dialog';

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  loading?: boolean;
};

/** Confirmation for important or irreversible actions; a failure is said by a notification. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
  loading = false,
}: Props) {
  return (
    <Dialog
      busy={loading}
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      }
    >
      {children}
    </Dialog>
  );
}
