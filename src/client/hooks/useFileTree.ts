import { useState, useEffect, useCallback } from 'react';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileTreeNode[];
}

export function useFileTree() {
  const [tree, setTree] = useState<FileTreeNode[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/tree');
      if (!res.ok) throw new Error('Failed to fetch file tree');
      const data: FileTreeNode[] = await res.json();
      setTree(data);
    } catch (err) {
      console.error('Error fetching file tree:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tree, refresh };
}
