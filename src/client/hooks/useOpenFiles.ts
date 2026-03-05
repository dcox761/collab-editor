import { useState, useCallback, useRef, useEffect } from 'react';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
}

export function useOpenFiles() {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  // Mirror openFiles in a ref so we can read the latest value synchronously
  // without relying on the setOpenFiles-as-getter anti-pattern.
  const openFilesRef = useRef<OpenFile[]>(openFiles);
  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  const openFile = useCallback(async (filePath: string) => {
    // Set active tab immediately
    setActiveFilePath(filePath);

    // Check if this file is already open (synchronous ref read)
    if (openFilesRef.current.some((f) => f.path === filePath)) {
      return;
    }

    try {
      const res = await fetch(`/api/files/${filePath}`);
      if (!res.ok) throw new Error('Failed to load file');
      const { content } = await res.json();
      const name = filePath.split('/').pop() || filePath;

      setOpenFiles((prev) => {
        // Double-check it wasn't added while we were fetching
        if (prev.some((f) => f.path === filePath)) return prev;
        return [
          ...prev,
          {
            path: filePath,
            name,
            content,
            savedContent: content,
            isDirty: false,
          },
        ];
      });
    } catch (err) {
      console.error('Error loading file:', err);
    }
  }, []);

  const closeFile = useCallback(
    (filePath: string) => {
      const file = openFilesRef.current.find((f) => f.path === filePath);
      if (file?.isDirty) {
        const confirmed = window.confirm(
          `"${file.name}" has unsaved changes. Discard them?`
        );
        if (!confirmed) return;
      }

      setOpenFiles((prev) => prev.filter((f) => f.path !== filePath));

      setActiveFilePath((prev) => {
        if (prev === filePath) {
          // Pick another tab from the ref (which still has the old list before filter)
          const remaining = openFilesRef.current.filter((f) => f.path !== filePath);
          return remaining.length > 0 ? remaining[0].path : null;
        }
        return prev;
      });
    },
    []
  );

  const setActiveFile = useCallback((filePath: string) => {
    setActiveFilePath(filePath);
  }, []);

  const updateContent = useCallback((filePath: string, newContent: string) => {
    if (newContent.trim() === '') {
      console.warn('[DEBUG-SAVE] updateContent called with EMPTY content for:', filePath, new Error().stack);
    }
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === filePath
          ? { ...f, content: newContent, isDirty: newContent !== f.savedContent }
          : f
      )
    );
  }, []);

  const markSaved = useCallback(async (filePath: string) => {
    // Read content synchronously from the ref — no setState-as-getter
    const file = openFilesRef.current.find((f) => f.path === filePath);
    const content = file?.content ?? '';
    const fileFound = !!file;

    console.log('[DEBUG-SAVE] markSaved called for:', filePath, {
      fileFound,
      contentLength: content.length,
      contentEmpty: content.trim() === '',
      contentPreview: content.substring(0, 100),
    });

    if (!fileFound) {
      console.error('[DEBUG-SAVE] markSaved: file NOT found in openFiles for path:', filePath);
      return; // Don't save if file not found — avoids writing empty content
    }
    if (content.trim() === '') {
      console.error('[DEBUG-SAVE] markSaved: about to save EMPTY content for:', filePath);
    }

    try {
      const res = await fetch(`/api/files/${filePath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Failed to save file');

      setOpenFiles((prev) =>
        prev.map((f) =>
          f.path === filePath
            ? { ...f, savedContent: content, isDirty: false }
            : f
        )
      );
    } catch (err) {
      console.error('Error saving file:', err);
      alert('Failed to save file');
    }
  }, []);

  return {
    openFiles,
    activeFilePath,
    openFile,
    closeFile,
    setActiveFile,
    updateContent,
    markSaved,
  };
}
