import { Router } from 'express';
import { requireRole } from '../../middlewares/authenticate';
import { uploadScan } from '../../middlewares/upload';
import * as controller from './invoice.controller';

/**
 * Mounted under /applications/:id/invoices, after the applications router's requireAuth.
 * Department and annulment rules are checked in the service, like for the other documents.
 */
export const invoiceRouter = Router({ mergeParams: true });

invoiceRouter.get('/', controller.list);
invoiceRouter.post('/', controller.create);
invoiceRouter.patch('/:iid', controller.update);
invoiceRouter.post('/:iid/cancel', controller.cancel);
invoiceRouter.post('/:iid/restore', requireRole('ADMIN'), controller.restore);
invoiceRouter.delete('/:iid', requireRole('ADMIN'), controller.remove);
// Access is checked before the file is read, so a refusal costs no upload. Both files are PDF.
invoiceRouter.put(
  '/:iid/files/:kind',
  controller.checkFileEditable,
  uploadScan,
  controller.uploadFile,
);
invoiceRouter.get('/:iid/files/:kind', controller.downloadFile);
invoiceRouter.delete('/:iid/files/:kind', controller.removeFile);
