import { useState } from 'react';
import FileTreeItem from './FileTreeItem';
import NewFileDialog from './NewFileDialog';
import type { FileTreeNode } from '../../hooks/useFileTree';

interface FileBrowserProps {
  tree: FileTreeNode[];
  refresh: () => void;
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
}

export default function FileBrowser({ tree, refresh, activeFilePath, onFileSelect }: FileBrowserProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newDialogType, setNewDialogType] = useState<'file' | 'dir'>('file');
  const [newDialogParent, setNewDialogParent] = useState('');

  const handleNewFile = (parentPath: string) => {
    setNewDialogType('file');
    setNewDialogParent(parentPath);
    setShowNewDialog(true);
  };

  const handleNewFolder = (parentPath: string) => {
    setNewDialogType('dir');
    setNewDialogParent(parentPath);
    setShowNewDialog(true);
  };

  const handleCreate = async (name: string) => {
    const fullPath = newDialogParent ? `${newDialogParent}/${name}` : name;
    const finalPath = newDialogType === 'file' && !name.endsWith('.md') ? `${fullPath}.md` : fullPath;

    try {
      const res = await fetch(`/api/files/${finalPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newDialogType }),
      });
      if (!res.ok) throw new Error('Failed to create');
      refresh();
    } catch (err) {
      console.error('Error creating:', err);
      alert('Failed to create');
    }
    setShowNewDialog(false);
  };

  const handleDelete = async (filePath: string) => {
    if (!window.confirm(`Are you sure you want to delete "${filePath}"?`)) return;
    try {
      const res = await fetch(`/api/files/${filePath}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      refresh();
    } catch (err) {
      console.error('Error deleting:', err);
      alert('Failed to delete');
    }
  };

  const handleRename = async (filePath: string) => {
    const newName = window.prompt('Enter new name:', filePath.split('/').pop());
    if (!newName) return;
    const parentDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
    const newPath = parentDir ? `${parentDir}/${newName}` : newName;
    try {
      const res = await fetch(`/api/files/${filePath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath }),
      });
      if (!res.ok) throw new Error('Failed to rename');
      refresh();
    } catch (err) {
      console.error('Error renaming:', err);
      alert('Failed to rename');
    }
  };

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <span className="file-browser-title">Files</span>
        <div className="file-browser-actions">
          <button
            className="file-browser-btn"
            onClick={refresh}
            title="Refresh file tree"
          >
            🔄
          </button>
          <button
            className="file-browser-btn"
            onClick={() => handleNewFile('')}
            title="New File"
          >
            📄
          </button>
          <button
            className="file-browser-btn"
            onClick={() => handleNewFolder('')}
            title="New Folder"
          >
            📁
          </button>
        </div>
      </div>
      <div className="file-browser-tree">
        {tree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            onFileSelect={onFileSelect}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        ))}
        {tree.length === 0 && (
          <div className="file-browser-empty">No files yet</div>
        )}
      </div>
      {showNewDialog && (
        <NewFileDialog
          type={newDialogType}
          parentPath={newDialogParent}
          onConfirm={handleCreate}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
