import { Router } from 'express';
import { requireRole } from '../../middlewares/authenticate';
import * as controller from './tuPayment.controller';

/**
 * Mounted under /applications/:id/technical-conditions/:tid/payment. Department, annulment
 * and cancelled-TU rules are checked in the service, like for the documents.
 */
export const tuPaymentRouter = Router({ mergeParams: true });

tuPaymentRouter.put('/', controller.save);
tuPaymentRouter.delete('/', requireRole('ADMIN'), controller.remove);
tuPaymentRouter.get('/next-contract-number', controller.nextContractNumber);
// Access is checked before the file is read, so a refusal costs no upload.
tuPaymentRouter.put(
  '/scans/:kind',
  controller.checkScanEditable,
  controller.receiveFile,
  controller.uploadScan,
);
tuPaymentRouter.get('/scans/:kind', controller.downloadScan);
tuPaymentRouter.delete('/scans/:kind', controller.removeScan);
