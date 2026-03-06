import { useCallback, useState } from 'react';
import FileBrowser from './components/FileBrowser/FileBrowser';
import EditorPanel from './components/Editor/EditorPanel';
import ChatPanel from './components/ChatPanel/ChatPanel';
import ResizeHandle from './components/ResizeHandle';
import UsernameDialog from './components/UsernameDialog';
import { useFileTree } from './hooks/useFileTree';
import { useOpenFiles } from './hooks/useOpenFiles';
import { useUserIdentity } from './hooks/useUserIdentity';

const MIN_LEFT = 150;
const MIN_RIGHT = 150;
const DEFAULT_LEFT = 250;
const DEFAULT_RIGHT = 300;

export default function App() {
  const { tree, refresh } = useFileTree();
  const {
    openFiles,
    activeFilePath,
    openFile,
    closeFile,
    setActiveFile,
  } = useOpenFiles();

  const {
    identity,
    sessionName,
    needsPrompt,
    setName,
    dismissPrompt,
    showChangeDialog,
    setShowChangeDialog,
  } = useUserIdentity();

  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT);

  const handleFileSelect = useCallback(
    (filePath: string) => {
      openFile(filePath);
    },
    [openFile]
  );

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((prev) => Math.max(MIN_LEFT, prev + delta));
  }, []);

  const handleRightResize = useCallback((delta: number) => {
    setRightWidth((prev) => Math.max(MIN_RIGHT, prev - delta));
  }, []);

  return (
    <div className="app-layout">
      <aside className="panel panel-left" style={{ width: leftWidth, minWidth: MIN_LEFT }}>
        <FileBrowser
          tree={tree}
          refresh={refresh}
          activeFilePath={activeFilePath}
          onFileSelect={handleFileSelect}
        />
      </aside>
      <ResizeHandle onResize={handleLeftResize} />
      <main className="panel panel-center">
        <EditorPanel
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          onTabSelect={setActiveFile}
          onTabClose={closeFile}
          sessionName={sessionName}
          onChangeUsername={() => setShowChangeDialog(true)}
        />
      </main>
      <ResizeHandle onResize={handleRightResize} />
      <aside className="panel panel-right" style={{ width: rightWidth, minWidth: MIN_RIGHT }}>
        <ChatPanel />
      </aside>

      {/* Username prompt on first visit */}
      {needsPrompt && (
        <UsernameDialog
          title="Welcome! Choose a display name"
          initialValue={identity.name}
          onConfirm={(name) => {
            setName(name);
            dismissPrompt();
          }}
          onCancel={dismissPrompt}
        />
      )}

      {/* Username change dialog */}
      {showChangeDialog && (
        <UsernameDialog
          title="Change display name"
          initialValue={identity.name}
          onConfirm={(name) => {
            setName(name);
            setShowChangeDialog(false);
          }}
          onCancel={() => setShowChangeDialog(false)}
        />
      )}
    </div>
  );
}
