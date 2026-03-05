import { useState } from 'react';

interface NewFileDialogProps {
  type: 'file' | 'dir';
  parentPath: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export default function NewFileDialog({ type, parentPath, onConfirm, onCancel }: NewFileDialogProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>New {type === 'file' ? 'File' : 'Folder'}</h3>
        {parentPath && <p className="dialog-parent">In: {parentPath}/</p>}
        <form onSubmit={handleSubmit}>
          <input
            className="dialog-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'file' ? 'filename.md' : 'folder-name'}
            autoFocus
          />
          <div className="dialog-actions">
            <button type="button" className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="dialog-btn dialog-btn-confirm" disabled={!name.trim()}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
