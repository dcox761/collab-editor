import { useEffect, useRef, useState, useCallback } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

type EditorMode = 'rich' | 'source';

/**
 * Normalize BlockNote's lossy markdown output to use common conventions:
 * - Convert "*   text" list items to "- text" (BlockNote emits star+3-space)
 * - Preserves nested list indentation
 */
function normalizeMarkdown(md: string): string {
  return md.replace(/^(\s*)\*   /gm, '$1- ');
}

interface MarkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
}

export default function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
  const editor = useCreateBlockNote();
  const [initialized, setInitialized] = useState(false);
  const [mode, setMode] = useState<EditorMode>('rich');
  const [sourceText, setSourceText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Capture initial content for one-time load (key={path} remounts on file switch)
  const initialContentRef = useRef(content);
  // Pending markdown to load into BlockNote after the view mounts
  const pendingMarkdownRef = useRef<string | null>(null);
  // Suppress onChange during programmatic block replacements (init + source→rich sync)
  const suppressOnChangeRef = useRef(false);
  // Track whether user has actually edited in rich mode since last mode switch
  const richEditedRef = useRef(false);
  // Last known "canonical" markdown — original file content or last source-mode text.
  // Used when toggling to source without edits to avoid re-serialization.
  const lastMarkdownRef = useRef(content);

  // Load markdown content into the editor once on mount
  // (component remounts via key={path} when switching files, so this runs per-file)
  useEffect(() => {
    let cancelled = false;
    async function loadContent() {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialContentRef.current);
        if (!cancelled) {
          suppressOnChangeRef.current = true;
          editor.replaceBlocks(editor.document, blocks);
          // Allow a tick for BlockNote to fire (and discard) the spurious onChange
          setTimeout(() => {
            suppressOnChangeRef.current = false;
          }, 0);
          setSourceText(initialContentRef.current);
          lastMarkdownRef.current = initialContentRef.current;
          setInitialized(true);
        }
      } catch (err) {
        console.error('Error parsing markdown:', err);
      }
    }
    loadContent();
    return () => {
      cancelled = true;
    };
  }, [editor]);

  // Apply pending markdown after switching to rich mode (BlockNoteView must be mounted first)
  useEffect(() => {
    if (mode !== 'rich' || pendingMarkdownRef.current === null) return;
    const markdown = pendingMarkdownRef.current;
    pendingMarkdownRef.current = null;

    async function applyPending() {
      try {
        suppressOnChangeRef.current = true;
        const blocks = await editor.tryParseMarkdownToBlocks(markdown);
        editor.replaceBlocks(editor.document, blocks);
        setTimeout(() => {
          suppressOnChangeRef.current = false;
        }, 0);
      } catch (err) {
        console.error('Error applying source changes to rich editor:', err);
        suppressOnChangeRef.current = false;
      }
    }
    applyPending();
  }, [mode, editor]);

  // Rich mode onChange — serialize blocks to normalized markdown
  const handleRichChange = useCallback(async () => {
    if (!initialized || suppressOnChangeRef.current) {
      return;
    }
    try {
      richEditedRef.current = true;
      const raw = await editor.blocksToMarkdownLossy(editor.document);
      const markdown = normalizeMarkdown(raw);
      lastMarkdownRef.current = markdown;
      onChange(markdown);
    } catch (err) {
      console.error('Error converting to markdown:', err);
    }
  }, [initialized, editor, onChange]);

  // Source mode onChange — pass raw text directly
  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setSourceText(value);
      lastMarkdownRef.current = value;
      onChange(value);
    },
    [onChange]
  );

  // Handle Tab key in source mode — insert spaces instead of changing focus
  const handleSourceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const indent = '  ';

        const newValue = value.substring(0, start) + indent + value.substring(end);
        setSourceText(newValue);
        lastMarkdownRef.current = newValue;
        onChange(newValue);

        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + indent.length;
        });
      }
    },
    [onChange]
  );

  // Toggle between rich and source modes with content sync
  const handleToggle = useCallback(async () => {
    if (mode === 'rich') {
      // Rich → Source: only re-serialize if user actually edited in rich mode.
      // This avoids lossy formatting changes when the user merely viewed the document.
      if (richEditedRef.current) {
        try {
          const raw = await editor.blocksToMarkdownLossy(editor.document);
          const markdown = normalizeMarkdown(raw);
          lastMarkdownRef.current = markdown;
          setSourceText(markdown);
        } catch (err) {
          console.error('Error serializing to markdown:', err);
        }
      } else {
        // No edits in rich mode — preserve the last known markdown exactly
        setSourceText(lastMarkdownRef.current);
      }
      richEditedRef.current = false;
      setMode('source');
      // Focus textarea after mode switch
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    } else {
      // Source → Rich: queue the markdown and switch mode;
      // the useEffect on mode will apply it after BlockNoteView mounts
      pendingMarkdownRef.current = sourceText;
      lastMarkdownRef.current = sourceText;
      richEditedRef.current = false;
      setMode('rich');
    }
  }, [mode, editor, sourceText]);

  return (
    <div className="markdown-editor">
      <div className="editor-mode-toggle">
        <button
          className={`mode-toggle-btn ${mode === 'rich' ? 'mode-toggle-active' : ''}`}
          onClick={() => mode !== 'rich' && handleToggle()}
          title="Rich editor (WYSIWYG)"
        >
          Rich
        </button>
        <button
          className={`mode-toggle-btn ${mode === 'source' ? 'mode-toggle-active' : ''}`}
          onClick={() => mode !== 'source' && handleToggle()}
          title="Source editor (raw markdown)"
        >
          Source
        </button>
      </div>
      <div className="editor-mode-content">
        {mode === 'rich' ? (
          <BlockNoteView editor={editor} onChange={handleRichChange} theme="light" />
        ) : (
          <textarea
            ref={textareaRef}
            className="source-textarea"
            value={sourceText}
            onChange={handleSourceChange}
            onKeyDown={handleSourceKeyDown}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
