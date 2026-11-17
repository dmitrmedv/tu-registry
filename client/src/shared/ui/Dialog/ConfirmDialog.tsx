import type { ReactNode } from 'react';
import { Alert } from '../Alert';
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
  error?: string;
};

/** Confirmation for important or irreversible actions. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
  loading = false,
  error,
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
      {error && <Alert variant="error">{error}</Alert>}
    </Dialog>
  );
}
