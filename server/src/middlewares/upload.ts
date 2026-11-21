import { randomUUID } from 'node:crypto';
import {
  DOCX_MIME_TYPE,
  SCAN_MAX_BYTES,
  SCAN_MAX_LABEL,
  SCAN_MIME_TYPE,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { ensureUploadDirs, uploadTmpDir } from '../modules/scans/scan.storage';
import { ApiError } from '../utils/ApiError';

type FileRule = {
  /** The form field the file comes in. */
  field: string;
  accepts: (file: Express.Multer.File) => boolean;
  wrongType: () => ApiError;
  tooLarge: string;
  malformed: string;
};

function singleFileUpload(rule: FileRule): RequestHandler {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, done) => {
        ensureUploadDirs().then(
          () => done(null, uploadTmpDir()),
          (error: unknown) => done(error as Error, ''),
        );
      },
      // Never the user's file name on disk.
      filename: (_req, _file, done) => done(null, `${randomUUID()}.upload`),
    }),
    // One file and nothing else: bounds what a request can make the server read and write.
    limits: { fileSize: SCAN_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    // Browsers send file names in UTF-8 ("Скан заяви.pdf"); multer assumes latin1 otherwise.
    defParamCharset: 'utf8',
    fileFilter: (_req, file, accept) => {
      if (rule.accepts(file)) accept(null, true);
      else accept(rule.wrongType());
    },
  });
  return (req, res, next) => {
    upload.single(rule.field)(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(413, 'SCAN_TOO_LARGE', rule.tooLarge));
      }
      // A refusal of ours, or a system error (disk full, no access: it has an errno code) → as is.
      if (error instanceof ApiError || (error as NodeJS.ErrnoException).errno !== undefined) {
        return next(error);
      }
      // Anything else is a malformed request (multer's limits, busboy's "Malformed part header").
      next(new ApiError(400, 'BAD_UPLOAD', rule.malformed));
    });
  };
}

/**
 * Reads one PDF from the "scan" field into the upload folder (multer removes partial files on
 * error). The caller checks access first and moves or removes the file afterwards.
 */
export const uploadScan = singleFileUpload({
  field: 'scan',
  accepts: (file) => file.mimetype === SCAN_MIME_TYPE,
  wrongType: () => new ApiError(400, 'SCAN_NOT_PDF', 'Скан має бути PDF-файлом'),
  tooLarge: `Скан більший за ${SCAN_MAX_LABEL}`,
  malformed: 'Надішліть один PDF-файл у полі «scan»',
});

/**
 * One Word document (.docx) from the "document" field, like `uploadScan`. A browser that does
 * not know the type sends a generic one: then the extension decides, and the content is
 * checked when the file is stored.
 */
export const uploadDocx = singleFileUpload({
  field: 'document',
  accepts: (file) =>
    file.mimetype === DOCX_MIME_TYPE ||
    (file.mimetype === 'application/octet-stream' && /\.docx$/i.test(file.originalname)),
  wrongType: () => new ApiError(400, 'NOT_DOCX', 'Документ має бути файлом Word (.docx)'),
  tooLarge: `Документ більший за ${SCAN_MAX_LABEL}`,
  malformed: 'Надішліть один файл .docx у полі «document»',
});
