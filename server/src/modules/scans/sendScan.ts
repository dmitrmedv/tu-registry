import type { NextFunction, Response } from 'express';
import { DOCX_MIME_TYPE, SCAN_MIME_TYPE } from '@tu-registry/shared';
import { ApiError } from '../../utils/ApiError';
import type { StoredFileType } from './scan.storage';

/** RFC 6266: an ASCII fallback plus the real (Ukrainian) name. */
function disposition(kind: 'inline' | 'attachment', name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Streams a stored file whose access the caller has already checked: a PDF opens in the
 * browser, a Word document is downloaded.
 */
export function sendScanFile(
  res: Response,
  next: NextFunction,
  scan: { path: string; name: string; type?: StoredFileType },
) {
  const isDocx = scan.type === 'docx';
  res.sendFile(
    scan.path,
    {
      headers: {
        'Content-Type': isDocx ? DOCX_MIME_TYPE : SCAN_MIME_TYPE,
        'Content-Disposition': disposition(isDocx ? 'attachment' : 'inline', scan.name),
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
