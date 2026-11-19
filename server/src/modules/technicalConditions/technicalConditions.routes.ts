import { Router } from 'express';
import { requireRole } from '../../middlewares/authenticate';
import { uploadScan } from '../../middlewares/upload';
import { tuPaymentRouter } from '../tuPayments/tuPayment.routes';
import * as controller from './technicalConditions.controller';

/**
 * Mounted under /applications/:id/technical-conditions, after the applications router's
 * requireAuth. Department and annulment rules are checked in the service, like for responses.
 */
export const technicalConditionsRouter = Router({ mergeParams: true });

technicalConditionsRouter.get('/', controller.list);
technicalConditionsRouter.post('/', controller.create);
technicalConditionsRouter.patch('/:tid', controller.update);
technicalConditionsRouter.post('/:tid/cancel', controller.cancel);
technicalConditionsRouter.post('/:tid/restore', requireRole('ADMIN'), controller.restore);
// Access is checked before the file is read, so a refusal costs no upload.
technicalConditionsRouter.put(
  '/:tid/scan',
  controller.checkScanEditable,
  uploadScan,
  controller.uploadScan,
);
technicalConditionsRouter.get('/:tid/scan', controller.downloadScan);
technicalConditionsRouter.delete('/:tid/scan', controller.removeScan);
technicalConditionsRouter.use('/:tid/payment', tuPaymentRouter);
