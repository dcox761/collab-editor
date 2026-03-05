import type { OpenFile } from '../../hooks/useOpenFiles';

interface TabProps {
  file: OpenFile;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export default function Tab({ file, isActive, onSelect, onClose }: TabProps) {
  return (
    <div
      className={`tab ${isActive ? 'tab-active' : ''}`}
      onClick={onSelect}
    >
      <span className="tab-name">
        {file.name}
      </span>
      <button
        className="tab-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close"
      >
        ×
      </button>
    </div>
  );
}
