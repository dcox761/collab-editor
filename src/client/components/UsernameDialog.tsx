import { useState, useRef, useEffect } from 'react';

interface UsernameDialogProps {
  title: string;
  initialValue: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

/**
 * Modal dialog for entering or changing a display name.
 * Auto-focuses the input and submits on Enter.
 */
export default function UsernameDialog({ title, initialValue, onConfirm, onCancel }: UsernameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-select text on open
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <input
          ref={inputRef}
          className="dialog-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Enter your name…"
          autoFocus
          maxLength={40}
        />
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dialog-btn dialog-btn-confirm"
            onClick={handleSubmit}
            disabled={!value.trim()}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
