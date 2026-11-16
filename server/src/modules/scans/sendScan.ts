import type { NextFunction, Response } from 'express';
import { ApiError } from '../../utils/ApiError';

/** RFC 6266: an ASCII fallback plus the real (Ukrainian) name, opened in the browser. */
function inlineDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Streams a stored PDF whose access the caller has already checked. */
export function sendScanFile(
  res: Response,
  next: NextFunction,
  scan: { path: string; name: string },
) {
  res.sendFile(
    scan.path,
    {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': inlineDisposition(scan.name),
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
