import { useState, useCallback, useRef, useEffect } from 'react';

export interface OpenFile {
  path: string;
  name: string;
}

/**
 * Manages the set of open file tabs and the active tab.
 * Content is no longer tracked here — Y.js owns the document content.
 */
export function useOpenFiles() {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const openFilesRef = useRef<OpenFile[]>(openFiles);
  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  const openFile = useCallback((filePath: string) => {
    setActiveFilePath(filePath);

    // Check if already open
    if (openFilesRef.current.some((f) => f.path === filePath)) {
      return;
    }

    const name = filePath.split('/').pop() || filePath;
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === filePath)) return prev;
      return [...prev, { path: filePath, name }];
    });
  }, []);

  const closeFile = useCallback((filePath: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== filePath));

    setActiveFilePath((prev) => {
      if (prev === filePath) {
        const remaining = openFilesRef.current.filter((f) => f.path !== filePath);
        return remaining.length > 0 ? remaining[0].path : null;
      }
      return prev;
    });
  }, []);

  const setActiveFile = useCallback((filePath: string) => {
    setActiveFilePath(filePath);
  }, []);

  return {
    openFiles,
    activeFilePath,
    openFile,
    closeFile,
    setActiveFile,
  };
}
