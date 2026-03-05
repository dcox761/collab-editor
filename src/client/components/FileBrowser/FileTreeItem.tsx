import { useState } from 'react';
import type { FileTreeNode } from '../../hooks/useFileTree';

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string) => void;
}

export default function FileTreeItem({
  node,
  depth,
  activeFilePath,
  onFileSelect,
  onNewFile,
  onNewFolder,
  onDelete,
  onRename,
}: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const [showContextMenu, setShowContextMenu] = useState(false);

  const isActive = node.type === 'file' && node.path === activeFilePath;
  const paddingLeft = 12 + depth * 16;

  const handleClick = () => {
    if (node.type === 'dir') {
      setExpanded(!expanded);
    } else {
      onFileSelect(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(!showContextMenu);
  };

  return (
    <div className="file-tree-item-wrapper">
      <div
        className={`file-tree-item ${isActive ? 'file-tree-item-active' : ''}`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <span className="file-tree-icon">
          {node.type === 'dir' ? (expanded ? '📂' : '📁') : '📄'}
        </span>
        <span className="file-tree-name">{node.name}</span>
        <div className="file-tree-item-actions">
          {node.type === 'dir' && (
            <>
              <button
                className="file-tree-action-btn"
                onClick={(e) => { e.stopPropagation(); onNewFile(node.path); }}
                title="New File"
              >
                +📄
              </button>
              <button
                className="file-tree-action-btn"
                onClick={(e) => { e.stopPropagation(); onNewFolder(node.path); }}
                title="New Folder"
              >
                +📁
              </button>
            </>
          )}
          <button
            className="file-tree-action-btn"
            onClick={(e) => { e.stopPropagation(); onRename(node.path); }}
            title="Rename"
          >
            ✏️
          </button>
          <button
            className="file-tree-action-btn"
            onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
      {node.type === 'dir' && expanded && node.children && (
        <div className="file-tree-children">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onFileSelect={onFileSelect}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}
