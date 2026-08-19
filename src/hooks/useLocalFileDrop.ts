import { useState, type DragEvent } from 'react';

export function useLocalFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [active, setActive] = useState(false);

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!disabled) setActive(true);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  };

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setActive(false);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setActive(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return {
    active,
    handlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
