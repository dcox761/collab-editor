import { useCallback } from 'react';
import FileBrowser from './components/FileBrowser/FileBrowser';
import EditorPanel from './components/Editor/EditorPanel';
import ChatPanel from './components/ChatPanel/ChatPanel';
import { useFileTree } from './hooks/useFileTree';
import { useOpenFiles } from './hooks/useOpenFiles';

export default function App() {
  const { tree, refresh } = useFileTree();
  const {
    openFiles,
    activeFilePath,
    openFile,
    closeFile,
    setActiveFile,
  } = useOpenFiles();

  const handleFileSelect = useCallback(
    (filePath: string) => {
      openFile(filePath);
    },
    [openFile]
  );

  return (
    <div className="app-layout">
      <aside className="panel panel-left">
        <FileBrowser
          tree={tree}
          refresh={refresh}
          activeFilePath={activeFilePath}
          onFileSelect={handleFileSelect}
        />
      </aside>
      <main className="panel panel-center">
        <EditorPanel
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          onTabSelect={setActiveFile}
          onTabClose={closeFile}
        />
      </main>
      <aside className="panel panel-right">
        <ChatPanel />
      </aside>
    </div>
  );
}
