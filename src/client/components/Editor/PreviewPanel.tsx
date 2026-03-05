import { useEffect, useState, useRef } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import * as Y from 'yjs';

interface PreviewPanelProps {
  yText: Y.Text;
}

/**
 * Read-only BlockNote preview that renders formatted markdown.
 * Observes Y.Text changes (debounced 300ms) and re-parses into BlockNote blocks.
 */
export default function PreviewPanel({ yText }: PreviewPanelProps) {
  const editor = useCreateBlockNote();
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse markdown content into BlockNote blocks
  const updatePreview = async (markdown: string) => {
    try {
      const blocks = await editor.tryParseMarkdownToBlocks(markdown);
      editor.replaceBlocks(editor.document, blocks);
    } catch (err) {
      console.error('[Preview] Error parsing markdown:', err);
    }
  };

  useEffect(() => {
    // Initial render
    const initialContent = yText.toString();
    updatePreview(initialContent).then(() => setLoading(false));

    // Observe Y.Text changes with debounce
    const observer = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        const content = yText.toString();
        updatePreview(content);
      }, 300);
    };

    yText.observe(observer);

    return () => {
      yText.unobserve(observer);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yText]);

  if (loading) {
    return (
      <div style={{ padding: '16px', color: '#888' }}>
        Loading preview…
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <BlockNoteView
        editor={editor}
        editable={false}
        theme="light"
      />
    </div>
  );
}
