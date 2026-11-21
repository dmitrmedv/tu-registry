import type { NextFunction, Response } from 'express';
import { DOCX_MIME_TYPE, IMD_MIME_TYPE, SCAN_MIME_TYPE } from '@tu-registry/shared';
import { ApiError } from '../../utils/ApiError';
import type { StoredFileType } from './scan.storage';

/** RFC 6266: an ASCII fallback plus the real (Ukrainian) name. */
function disposition(kind: 'inline' | 'attachment', name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Streams a stored file whose access the caller has already checked: a PDF opens in the
 * browser, a Word document or an IMD file is downloaded.
 */
export function sendScanFile(
  res: Response,
  next: NextFunction,
  scan: { path: string; name: string; type?: StoredFileType },
) {
  const type = scan.type ?? 'pdf';
  const contentType = { pdf: SCAN_MIME_TYPE, docx: DOCX_MIME_TYPE, imd: IMD_MIME_TYPE }[type];
  res.sendFile(
    scan.path,
    {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition(type === 'pdf' ? 'inline' : 'attachment', scan.name),
        // Customer documents: never kept by shared caches.
        'Cache-Control': 'private, no-store',
      },
    },
    (error?: NodeJS.ErrnoException) => {
      if (!error) return;
      next(
        error.code === 'ENOENT' ? ApiError.notFound('Файл скану не знайдено') : (error as Error),
      );
    },
  );
}
