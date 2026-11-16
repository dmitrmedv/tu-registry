import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { TextField } from '@/shared/ui';

type Props = {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
};

/**
 * A text filter that updates the URL only after typing pauses. It follows outside changes
 * too (reset button, browser Back) without echoing a stale value back into the URL.
 */
export function SearchField({ label, value, onCommit, placeholder, className }: Props) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 400);
  const committed = useRef(value);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (debounced.trim() !== committed.current) {
      committed.current = debounced.trim();
      onCommitRef.current(committed.current);
    }
  }, [debounced]);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  return (
    <TextField
      label={label}
      type="search"
      value={text}
      placeholder={placeholder}
      className={className}
      onChange={(event) => setText(event.target.value)}
    />
  );
}
