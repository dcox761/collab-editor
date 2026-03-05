import { useEffect, useRef, useState, useCallback } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

type EditorMode = 'rich' | 'source';

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

  // Load markdown content into the editor once on mount
  // (component remounts via key={path} when switching files, so this runs per-file)
  useEffect(() => {
    let cancelled = false;
    async function loadContent() {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialContentRef.current);
        if (!cancelled) {
          editor.replaceBlocks(editor.document, blocks);
          setSourceText(initialContentRef.current);
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
        const blocks = await editor.tryParseMarkdownToBlocks(markdown);
        editor.replaceBlocks(editor.document, blocks);
      } catch (err) {
        console.error('Error applying source changes to rich editor:', err);
      }
    }
    applyPending();
  }, [mode, editor]);

  // Rich mode onChange — serialize blocks to markdown
  const handleRichChange = useCallback(async () => {
    if (!initialized) return;
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
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
      // Rich → Source: serialize current blocks to markdown
      try {
        const markdown = await editor.blocksToMarkdownLossy(editor.document);
        setSourceText(markdown);
        setMode('source');
        // Focus textarea after mode switch
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      } catch (err) {
        console.error('Error serializing to markdown:', err);
      }
    } else {
      // Source → Rich: queue the markdown and switch mode;
      // the useEffect on mode will apply it after BlockNoteView mounts
      pendingMarkdownRef.current = sourceText;
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
