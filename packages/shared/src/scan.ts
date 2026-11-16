/** A scan of the application's documents: one PDF per application, optional. */
export const SCAN_MAX_BYTES = 50 * 1024 * 1024;
export const SCAN_MAX_LABEL = '50 МБ';
export const SCAN_MIME_TYPE = 'application/pdf';
export const SCAN_NAME_MAX = 255;

/** What the API tells about a stored scan; the file itself comes from GET …/scan. */
export type ScanDto = {
  name: string;
  size: number;
  uploadedAt: string;
  uploadedBy: { id: string; fullName: string };
};

/** "12,4 МБ" / "830 КБ": sizes as people read them. */
export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}
