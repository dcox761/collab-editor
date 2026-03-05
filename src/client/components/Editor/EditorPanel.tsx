import { useEffect, useCallback } from 'react';
import TabBar from './TabBar';
import MarkdownEditor from './MarkdownEditor';
import type { OpenFile } from '../../hooks/useOpenFiles';

interface EditorPanelProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
  onContentChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
}

export default function EditorPanel({
  openFiles,
  activeFilePath,
  onTabSelect,
  onTabClose,
  onContentChange,
  onSave,
}: EditorPanelProps) {
  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  // Ctrl+S / Cmd+S handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeFilePath) {
          onSave(activeFilePath);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFilePath, onSave]);

  const handleContentChange = useCallback(
    (markdown: string) => {
      if (activeFilePath) {
        onContentChange(activeFilePath, markdown);
      }
    },
    [activeFilePath, onContentChange]
  );

  if (openFiles.length === 0) {
    return (
      <div className="editor-panel">
        <div className="editor-empty">
          <p>Open a file from the sidebar to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-panel">
      <TabBar
        openFiles={openFiles}
        activeFilePath={activeFilePath}
        onTabSelect={onTabSelect}
        onTabClose={onTabClose}
      />
      <div className="editor-content">
        {activeFile && (
          <MarkdownEditor
            key={activeFile.path}
            content={activeFile.content}
            onChange={handleContentChange}
          />
        )}
      </div>
    </div>
  );
}
