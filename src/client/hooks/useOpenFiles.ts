import { useState, useCallback } from 'react';

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

  const openFile = useCallback(async (filePath: string) => {
    // If file is already open, just switch to it
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === filePath)) {
        return prev;
      }
      return prev;
    });

    // Check if already open
    setActiveFilePath(filePath);

    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === filePath)) {
        return prev;
      }
      // Will load content asynchronously
      return prev;
    });

    // Load content if not already open
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === filePath)) {
        return prev;
      }
      return prev; // placeholder — actual load is below
    });

    // Check if this file is already open before fetching
    let alreadyOpen = false;
    setOpenFiles((prev) => {
      alreadyOpen = prev.some((f) => f.path === filePath);
      return prev;
    });

    if (!alreadyOpen) {
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
    }
  }, []);

  const closeFile = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        const file = prev.find((f) => f.path === filePath);
        if (file?.isDirty) {
          const confirmed = window.confirm(
            `"${file.name}" has unsaved changes. Discard them?`
          );
          if (!confirmed) return prev;
        }
        return prev.filter((f) => f.path !== filePath);
      });

      setActiveFilePath((prev) => {
        if (prev === filePath) {
          // Switch to another tab or null
          let remaining: OpenFile[] = [];
          setOpenFiles((prev) => {
            remaining = prev;
            return prev;
          });
          // remaining still has the old list at this point, so we use openFiles from closure
          return null;
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
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === filePath
          ? { ...f, content: newContent, isDirty: newContent !== f.savedContent }
          : f
      )
    );
  }, []);

  const markSaved = useCallback(async (filePath: string) => {
    let content = '';
    setOpenFiles((prev) => {
      const file = prev.find((f) => f.path === filePath);
      if (file) content = file.content;
      return prev;
    });

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
