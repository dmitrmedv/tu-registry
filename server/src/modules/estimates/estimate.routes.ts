import { Router } from 'express';
import { requireRole } from '../../middlewares/authenticate';
import * as controller from './estimate.controller';

/**
 * Mounted under /applications/:id/estimates, after the applications router's requireAuth.
 * Department and annulment rules are checked in the service, like for the other documents.
 */
export const estimateRouter = Router({ mergeParams: true });

estimateRouter.get('/', controller.list);
estimateRouter.post('/', controller.create);
estimateRouter.patch('/:eid', controller.update);
estimateRouter.delete('/:eid', requireRole('ADMIN'), controller.remove);
// Access is checked before the file is read, so a refusal costs no upload.
estimateRouter.put(
  '/:eid/files/:kind',
  controller.checkFileEditable,
  controller.receiveFile,
  controller.uploadFile,
);
estimateRouter.get('/:eid/files/:kind', controller.downloadFile);
estimateRouter.delete('/:eid/files/:kind', controller.removeFile);
