import { openPdf } from '@/shared/lib/pdf';
import { applicationsApi } from './api';

/** Opens the application's scan in a new tab (see openPdf). */
export const openScan = (applicationId: string, fileName: string) =>
  openPdf(() => applicationsApi.scanFile(applicationId), fileName);
