import { Router } from 'express';
import { requireRole } from '../../middlewares/authenticate';
import { uploadScan } from '../../middlewares/upload';
import * as controller from './project.controller';

/**
 * Mounted under /applications/:id/projects, after the applications router's requireAuth.
 * Department and annulment rules are checked in the service, like for technical conditions.
 */
export const projectRouter = Router({ mergeParams: true });

projectRouter.get('/', controller.list);
projectRouter.post('/', controller.create);
projectRouter.patch('/:pid', controller.update);
projectRouter.delete('/:pid', requireRole('ADMIN'), controller.remove);
projectRouter.post('/:pid/cancel', controller.cancel);
projectRouter.post('/:pid/restore', requireRole('ADMIN'), controller.restore);
// Access is checked before the file is read, so a refusal costs no upload.
projectRouter.put('/:pid/scan', controller.checkEditable, uploadScan, controller.uploadScan);
projectRouter.get('/:pid/scan', controller.downloadScan);
projectRouter.delete('/:pid/scan', controller.removeScan);
projectRouter.put(
  '/:pid/files/:kind',
  controller.checkEditable,
  controller.receiveFile,
  controller.uploadFile,
);
projectRouter.get('/:pid/files/:kind', controller.downloadFile);
projectRouter.delete('/:pid/files/:kind', controller.removeFile);
