import {
  DOCX_MIME_TYPE,
  SCAN_MAX_BYTES,
  SCAN_MAX_LABEL,
  SCAN_MIME_TYPE,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { type DragEvent, type ReactNode, useId, useRef, useState } from 'react';
import { Button, Icon, IconButton } from '@/shared/ui';
import styles from './ScanDropzone.module.scss';

/** A scan is a PDF; a contract is also kept as a Word document (agreed 2026-11-20). */
export type DropzoneFileType = 'pdf' | 'docx';

const FILE_TYPES = {
  pdf: {
    mime: SCAN_MIME_TYPE,
    extension: /\.pdf$/i,
    accept: 'application/pdf,.pdf',
    inputLabel: 'PDF-файл скану',
    wrongType: 'Оберіть PDF-файл',
    name: 'PDF',
    none: 'Скан не додано.',
    added: 'Скан додано',
    removal: 'Скан буде видалено після збереження.',
    view: 'Переглянути скан',
    viewIcon: 'eye',
    replace: 'Замінити скан',
    remove: 'Видалити скан',
  },
  docx: {
    mime: DOCX_MIME_TYPE,
    extension: /\.docx$/i,
    accept: `${DOCX_MIME_TYPE},.docx`,
    inputLabel: 'Файл DOCX',
    wrongType: 'Оберіть файл Word (.docx)',
    name: 'DOCX',
    none: 'Документ не додано.',
    added: 'Документ додано',
    removal: 'Документ буде видалено після збереження.',
    view: 'Завантажити документ',
    viewIcon: 'download',
    replace: 'Замінити документ',
    remove: 'Видалити документ',
  },
} as const;

/** Checks what the browser can tell; the server checks the content again. */
function fileProblem(file: File, type: DropzoneFileType) {
  const rule = FILE_TYPES[type];
  // Some systems report no type (or a generic one); the extension is the fallback.
  const known = file.type === rule.mime;
  const unknown = !file.type || file.type === 'application/octet-stream';
  if (!known && !(unknown && rule.extension.test(file.name))) return rule.wrongType;
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
  /** PDF by default. */
  fileType?: DropzoneFileType;
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
  fileType = 'pdf',
  children,
}: Props) {
  const texts = FILE_TYPES[fileType];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const titleId = useId();
  const problemId = useId();
  const added = file !== null || current !== undefined;
  const accepts = !disabled && !added;

  const take = (candidate: File | undefined) => {
    if (!candidate) return;
    const reason = fileProblem(candidate, fileType);
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
          {texts.added}
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
                <IconButton icon={texts.viewIcon} label={texts.view} onClick={current.onView} />
                <IconButton
                  icon="upload"
                  label={texts.replace}
                  disabled={disabled}
                  onClick={pick}
                />
                <IconButton
                  icon="trash"
                  label={texts.remove}
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
          <p className={styles.removal}>{texts.removal}</p>
        ) : (
          <p className={styles.limits}>{texts.none}</p>
        )}
        <p className={styles.prompt}>Перетягніть {texts.name} сюди або</p>
        <Button size="sm" disabled={disabled} onClick={pick}>
          Обрати файл
        </Button>
        <p className={styles.limits}>
          Лише {texts.name}, до {SCAN_MAX_LABEL}
        </p>
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
          accept={texts.accept}
          className="visually-hidden"
          tabIndex={-1}
          aria-label={texts.inputLabel}
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
