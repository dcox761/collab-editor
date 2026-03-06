import { useCallback, useEffect, useRef } from 'react';

interface ResizeHandleProps {
  /** Called during drag with the delta in pixels (positive = right/down) */
  onResize: (deltaX: number) => void;
  /** Optional CSS class override */
  className?: string;
}

/**
 * A vertical drag handle for resizing adjacent panels.
 * Captures pointer on mousedown, fires onResize with pixel deltas during drag.
 */
export default function ResizeHandle({ onResize, className }: ResizeHandleProps) {
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      lastXRef.current = e.clientX;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    []
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize]);

  return (
    <div
      className={className || 'resize-handle'}
      onMouseDown={handleMouseDown}
    />
  );
}
