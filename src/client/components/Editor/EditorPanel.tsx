import { useEffect, useCallback, useState, useRef } from 'react';
import TabBar from './TabBar';
import SourceEditor from './SourceEditor';
import PreviewPanel from './PreviewPanel';
import PresenceBar from './PresenceBar';
import { useYjsProvider } from '../../hooks/useYjsProvider';
import type { OpenFile } from '../../hooks/useOpenFiles';

type ViewMode = 'source' | 'preview';

interface EditorPanelProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
  /** Session display name (may include multi-window suffix) */
  sessionName: string;
  /** Callback to open the change-username dialog */
  onChangeUsername: () => void;
}

export default function EditorPanel({
  openFiles,
  activeFilePath,
  onTabSelect,
  onTabClose,
  sessionName,
  onChangeUsername,
}: EditorPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('source');

  // Track whether both source and preview have been activated at least once
  // so we can keep them mounted for scroll/cursor preservation
  const [hasShownSource, setHasShownSource] = useState(true);
  const [hasShownPreview, setHasShownPreview] = useState(false);

  // Y.js provider manages the collaborative document for the active file
  const yjsState = useYjsProvider(activeFilePath);

  // Reset which panels have been shown when active file changes
  const prevFileRef = useRef(activeFilePath);
  useEffect(() => {
    if (activeFilePath !== prevFileRef.current) {
      prevFileRef.current = activeFilePath;
      setViewMode('source');
      setHasShownSource(true);
      setHasShownPreview(false);
    }
  }, [activeFilePath]);

  // Track when each mode is first activated
  useEffect(() => {
    if (viewMode === 'source') setHasShownSource(true);
    if (viewMode === 'preview') setHasShownPreview(true);
  }, [viewMode]);

  // Publish session identity to Y.js awareness for cursor/presence sharing
  useEffect(() => {
    if (!yjsState?.awareness) return;
    // Read color from localStorage
    let color = '#888';
    try {
      const stored = localStorage.getItem('collab-editor-identity');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.color) color = parsed.color;
      }
    } catch {
      // ignore
    }
    yjsState.awareness.setLocalStateField('user', {
      name: sessionName,
      color,
    });
  }, [yjsState?.awareness, sessionName]);

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
              <button
                className="toolbar-btn toolbar-btn-username"
                onClick={onChangeUsername}
                title="Change display name"
              >
                👤 {sessionName}
              </button>
              <span className={`connection-status ${yjsState.connected ? 'connected' : 'disconnected'}`}>
                {yjsState.connected ? '● Connected' : '○ Disconnected'}
              </span>
            </>
          )}
        </div>
      )}
      <div className="editor-content">
        {/* Render both Source and Preview but hide the inactive one.
            This preserves CodeMirror scroll position and cursor when toggling. */}
        {activeFilePath && yjsState && hasShownSource && (
          <div
            className="editor-view-container"
            style={{ display: viewMode === 'source' ? 'flex' : 'none' }}
          >
            <SourceEditor
              key={activeFilePath}
              yText={yjsState.yText}
              awareness={yjsState.awareness}
              connected={yjsState.connected}
            />
          </div>
        )}
        {activeFilePath && yjsState && hasShownPreview && (
          <div
            className="editor-view-container"
            style={{ display: viewMode === 'preview' ? 'flex' : 'none' }}
          >
            <PreviewPanel
              key={`preview-${activeFilePath}`}
              yText={yjsState.yText}
            />
          </div>
        )}
      </div>
    </div>
  );
}
