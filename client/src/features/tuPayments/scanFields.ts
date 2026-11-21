import type { TuPaymentDto, TuPaymentScanKind } from '@tu-registry/shared';

/** Where each file of the payment is in its DTO. */
export const SCAN_FIELDS = {
  invoice: 'invoiceScan',
  receipt: 'receiptScan',
  act: 'actScan',
  contract: 'contractScan',
  contractDocument: 'contractDocument',
} as const satisfies Record<TuPaymentScanKind, keyof TuPaymentDto>;
