import { Router } from 'express';
import { requireRole } from '../../middlewares/authenticate';
import * as controller from './contract.controller';

/**
 * Mounted under /applications/:id/contracts. Department and annulment rules are checked in the
 * service, like for the other documents of the application.
 */
export const contractRouter = Router({ mergeParams: true });

contractRouter.get('/', controller.list);
contractRouter.get('/draft', controller.draft);
contractRouter.post('/', controller.create);
contractRouter.patch('/:cid', controller.update);
contractRouter.post('/:cid/cancel', controller.cancel);
contractRouter.delete('/:cid', requireRole('ADMIN'), controller.remove);
// Access is checked before the file is read, so a refusal costs no upload.
contractRouter.put(
  '/:cid/files/:kind',
  controller.checkFileEditable,
  controller.receiveFile,
  controller.uploadFile,
);
contractRouter.get('/:cid/files/:kind', controller.downloadFile);
contractRouter.delete('/:cid/files/:kind', controller.removeFile);
