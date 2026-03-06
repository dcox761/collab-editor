import { useEffect, useCallback, useState, useRef } from 'react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import TabBar from './TabBar';
import SourceEditor from './SourceEditor';
import PreviewPanel from './PreviewPanel';
import PresenceBar from './PresenceBar';
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
  /** Y.Text from the shared Y.js provider (lifted to App) */
  yText: Y.Text | null;
  /** Awareness from the shared Y.js provider */
  awareness: Awareness | null;
  /** Whether the Y.js WebSocket is connected */
  connected: boolean;
}

export default function EditorPanel({
  openFiles,
  activeFilePath,
  onTabSelect,
  onTabClose,
  sessionName,
  onChangeUsername,
  yText,
  awareness,
  connected,
}: EditorPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('source');

  // Track whether both source and preview have been activated at least once
  // so we can keep them mounted for scroll/cursor preservation
  const [hasShownSource, setHasShownSource] = useState(true);
  const [hasShownPreview, setHasShownPreview] = useState(false);

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
    if (!awareness) return;
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
    awareness.setLocalStateField('user', {
      name: sessionName,
      color,
    });
  }, [awareness, sessionName]);

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
          {awareness && (
            <>
              <PresenceBar awareness={awareness} />
              <button
                className="toolbar-btn toolbar-btn-username"
                onClick={onChangeUsername}
                title="Change display name"
              >
                👤 {sessionName}
              </button>
              <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                {connected ? '● Connected' : '○ Disconnected'}
              </span>
            </>
          )}
        </div>
      )}
      <div className="editor-content">
        {/* Render both Source and Preview but hide the inactive one.
            This preserves CodeMirror scroll position and cursor when toggling. */}
        {activeFilePath && yText && hasShownSource && (
          <div
            className="editor-view-container"
            style={{ display: viewMode === 'source' ? 'flex' : 'none' }}
          >
            <SourceEditor
              key={activeFilePath}
              yText={yText}
              awareness={awareness!}
              connected={connected}
            />
          </div>
        )}
        {activeFilePath && yText && hasShownPreview && (
          <div
            className="editor-view-container"
            style={{ display: viewMode === 'preview' ? 'flex' : 'none' }}
          >
            <PreviewPanel
              key={`preview-${activeFilePath}`}
              yText={yText}
            />
          </div>
        )}
      </div>
    </div>
  );
}
