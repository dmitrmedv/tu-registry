import {
  formatFileSize,
  SCAN_MAX_BYTES,
  SCAN_MAX_LABEL,
  SCAN_MIME_TYPE,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { type DragEvent, type ReactNode, useId, useRef, useState } from 'react';
import { Button } from '@/shared/ui';
import styles from './ScanDropzone.module.scss';

/** Checks what the browser can tell; the server checks the content again. */
function scanProblem(file: File) {
  // Some systems report no type for a PDF; the extension is the fallback.
  const isPdf = file.type === SCAN_MIME_TYPE || (!file.type && /\.pdf$/i.test(file.name));
  if (!isPdf) return 'Оберіть PDF-файл';
  if (file.size > SCAN_MAX_BYTES) return `Файл більший за ${SCAN_MAX_LABEL}`;
  return null;
}

type Props = {
  /** The chosen file, shown with its size and a way to take it back. */
  file: File | null;
  onChange: (file: File | null) => void;
  /** Label of the choose button: "Обрати файл", "Замінити". */
  chooseLabel?: string;
  /** A line on top, inside the zone (e.g. «Скан не додано.»). */
  note?: string;
  /**
   * What is already there, shown in the zone instead of the choose button (the TU payment
   * dialog, 2026-11-19): nothing more can be dropped until it is taken away.
   */
  added?: ReactNode;
  disabled?: boolean;
};

/**
 * Choosing one PDF: drag it onto the area or press the button (keyboard and screen readers
 * use the button). Files that are not PDFs or are too large are refused with a reason.
 */
export function ScanDropzone({
  file,
  onChange,
  chooseLabel = 'Обрати файл',
  note,
  added,
  disabled,
}: Props) {
  const accepts = !disabled && !added;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = useId();

  const take = (candidate: File | undefined) => {
    if (!candidate) return;
    const reason = scanProblem(candidate);
    setProblem(reason);
    if (!reason) onChange(candidate);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (accepts) take(event.dataTransfer.files[0]);
  };

  return (
    <div className={styles.wrapper}>
      <div
        className={clsx(styles.zone, dragging && styles.dragging, disabled && styles.disabled)}
        onDragEnter={(event) => {
          event.preventDefault();
          if (accepts) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          // Leaving for a child element is not leaving the zone.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {added ?? (
          <>
            {note && <p className={styles.limits}>{note}</p>}
            <p className={styles.prompt}>Перетягніть PDF сюди або</p>
            <Button size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
              {chooseLabel}
            </Button>
            <p className={styles.limits}>Лише PDF, до {SCAN_MAX_LABEL}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="PDF-файл скану"
          aria-describedby={problem ? problemId : undefined}
          disabled={!accepts}
          onChange={(event) => {
            take(event.target.files?.[0]);
            // The same file can be chosen again after being removed.
            event.target.value = '';
          }}
        />
      </div>
      {problem && (
        <p id={problemId} role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      {file && !added && (
        <div className={styles.file}>
          <span className={styles.fileName}>{file.name}</span>
          <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Прибрати файл ${file.name}`}
            onClick={() => onChange(null)}
          >
            Прибрати
          </Button>
        </div>
      )}
    </div>
  );
}
