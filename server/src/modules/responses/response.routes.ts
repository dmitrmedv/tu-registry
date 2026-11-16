import { Router } from 'express';
import { requireRole } from '../../middlewares/authenticate';
import { uploadScan } from '../../middlewares/upload';
import * as controller from './response.controller';

/**
 * Mounted under /applications/:id/responses, after the applications router's requireAuth.
 * Department and annulment rules are checked in the service, like the application's own.
 */
export const responseRouter = Router({ mergeParams: true });

responseRouter.get('/', controller.list);
responseRouter.post('/', controller.create);
responseRouter.patch('/:rid', controller.update);
responseRouter.post('/:rid/cancel', controller.cancel);
responseRouter.post('/:rid/restore', requireRole('ADMIN'), controller.restore);
// Access is checked before the file is read, so a refusal costs no upload.
responseRouter.put('/:rid/scan', controller.checkScanEditable, uploadScan, controller.uploadScan);
responseRouter.get('/:rid/scan', controller.downloadScan);
