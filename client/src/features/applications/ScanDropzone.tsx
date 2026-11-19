import { SCAN_MAX_BYTES, SCAN_MAX_LABEL, SCAN_MIME_TYPE } from '@tu-registry/shared';
import clsx from 'clsx';
import { type DragEvent, type ReactNode, useId, useRef, useState } from 'react';
import { Button, Icon, IconButton } from '@/shared/ui';
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
  /** Centred over the zone; names the block for screen readers. */
  title: string;
  /** The chosen file, not saved yet. */
  file: File | null;
  onChange: (file: File | null) => void;
  /** The stored scan: opening it and removing it. */
  current?: { onView: () => void; onRemove: () => void };
  /** The stored scan goes on «Зберегти»; this takes it back. */
  removal?: { onUndo: () => void };
  disabled?: boolean;
  /** Under the zone: the upload progress, errors. */
  children?: ReactNode;
};

/**
 * The one way a scan is added, shown and removed (agreed 2026-11-19): a title over a dashed
 * zone. In the zone either «Скан не додано.» with the choose button (drag and drop works too),
 * or «Скан додано» with icons only — open, replace, remove the stored scan, or take back a
 * chosen file. No file name, author or time: the card shows the scan, the zone only that it is
 * there. A pending removal waits in the zone too, so the layout keeps its shape.
 */
export function ScanDropzone({
  title,
  file,
  onChange,
  current,
  removal,
  disabled = false,
  children,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const titleId = useId();
  const problemId = useId();
  const added = file !== null || current !== undefined;
  const accepts = !disabled && !added;

  const take = (candidate: File | undefined) => {
    if (!candidate) return;
    const reason = scanProblem(candidate);
    setProblem(reason);
    if (!reason) onChange(candidate);
  };
  const pick = () => inputRef.current?.click();

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (accepts) take(event.dataTransfer.files[0]);
  };

  let contents: ReactNode;
  if (added) {
    contents = (
      <>
        <p className={styles.added}>
          <Icon name="check" />
          Скан додано
        </p>
        <div className={styles.actions}>
          {file ? (
            <IconButton
              icon="close"
              label="Прибрати файл"
              disabled={disabled}
              onClick={() => onChange(null)}
            />
          ) : (
            current && (
              <>
                <IconButton icon="eye" label="Переглянути скан" onClick={current.onView} />
                <IconButton
                  icon="upload"
                  label="Замінити скан"
                  disabled={disabled}
                  onClick={pick}
                />
                <IconButton
                  icon="trash"
                  label="Видалити скан"
                  tone="danger"
                  disabled={disabled}
                  onClick={current.onRemove}
                />
              </>
            )
          )}
        </div>
      </>
    );
  } else {
    contents = (
      <>
        {removal ? (
          <p className={styles.removal}>Скан буде видалено після збереження.</p>
        ) : (
          <p className={styles.limits}>Скан не додано.</p>
        )}
        <p className={styles.prompt}>Перетягніть PDF сюди або</p>
        <Button size="sm" disabled={disabled} onClick={pick}>
          Обрати файл
        </Button>
        <p className={styles.limits}>Лише PDF, до {SCAN_MAX_LABEL}</p>
        {removal && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={removal.onUndo}>
            Не видаляти
          </Button>
        )}
      </>
    );
  }

  return (
    <section className={styles.block} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
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
        {contents}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="PDF-файл скану"
          aria-describedby={problem ? problemId : undefined}
          // «Замінити скан» opens it while the stored scan is shown.
          disabled={disabled || file !== null}
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
      {children}
    </section>
  );
}
