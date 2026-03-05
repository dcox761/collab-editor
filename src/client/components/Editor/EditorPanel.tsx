import { useEffect, useCallback, useState } from 'react';
import TabBar from './TabBar';
import SourceEditor from './SourceEditor';
import PreviewPanel from './PreviewPanel';
import PresenceBar from './PresenceBar';
import { useYjsProvider } from '../../hooks/useYjsProvider';
import { useUserIdentity } from '../../hooks/useUserIdentity';
import type { OpenFile } from '../../hooks/useOpenFiles';

type ViewMode = 'source' | 'preview';

interface EditorPanelProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
}

export default function EditorPanel({
  openFiles,
  activeFilePath,
  onTabSelect,
  onTabClose,
}: EditorPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('source');

  // Y.js provider manages the collaborative document for the active file
  const yjsState = useYjsProvider(activeFilePath);

  // Publish user identity to awareness for cursor/presence sharing
  useUserIdentity(yjsState?.awareness ?? null);

  // Ctrl+S / Cmd+S → force-save via the Y.js persistence endpoint
  const handleSave = useCallback(async () => {
    if (!activeFilePath) return;
    try {
      const res = await fetch(`/api/save/${activeFilePath}`, { method: 'POST' });
      if (!res.ok) throw new Error('Force-save failed');
      console.log(`[Save] Force-saved: ${activeFilePath}`);
    } catch (err) {
      console.error('[Save] Error:', err);
    }
  }, [activeFilePath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

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
      {activeFilePath && (
        <div className="editor-toolbar">
          <button
            className={`toolbar-btn ${viewMode === 'source' ? 'toolbar-btn-active' : ''}`}
            onClick={() => setViewMode('source')}
          >
            Source
          </button>
          <button
            className={`toolbar-btn ${viewMode === 'preview' ? 'toolbar-btn-active' : ''}`}
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
          {yjsState && (
            <>
              <PresenceBar awareness={yjsState.awareness} />
              <span className={`connection-status ${yjsState.connected ? 'connected' : 'disconnected'}`}>
                {yjsState.connected ? '● Connected' : '○ Disconnected'}
              </span>
            </>
          )}
        </div>
      )}
      <div className="editor-content">
        {activeFilePath && yjsState && viewMode === 'source' && (
          <SourceEditor
            key={activeFilePath}
            yText={yjsState.yText}
            awareness={yjsState.awareness}
            connected={yjsState.connected}
          />
        )}
        {activeFilePath && yjsState && viewMode === 'preview' && (
          <PreviewPanel
            key={`preview-${activeFilePath}`}
            yText={yjsState.yText}
          />
        )}
      </div>
    </div>
  );
}
