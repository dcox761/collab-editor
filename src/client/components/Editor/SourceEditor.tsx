import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from '@codemirror/view';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldKeymap,
} from '@codemirror/language';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';

/**
 * Equivalent to codemirror's basicSetup, assembled from individual packages.
 * This avoids needing the `codemirror` meta-package.
 */
const basicSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

interface SourceEditorProps {
  yText: Y.Text;
  awareness: Awareness;
  connected: boolean;
}

/**
 * CodeMirror 6 editor bound to a Y.Text via y-codemirror.next.
 * This is the primary collaborative editor in the Source-First architecture.
 */
export default function SourceEditor({ yText, awareness, connected }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: yText.toString(),
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        markdown({ codeLanguages: languages }),
        yCollab(yText, awareness),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          },
          '.cm-content': {
            caretColor: '#528bff',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: '#528bff',
          },
          '.cm-gutters': {
            backgroundColor: '#f5f5f5',
            border: 'none',
          },
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only recreate when yText/awareness identity changes (i.e., new document)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yText, awareness]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {!connected && (
        <div
          style={{
            background: '#fff3cd',
            color: '#856404',
            padding: '4px 12px',
            fontSize: '12px',
            borderBottom: '1px solid #ffc107',
            textAlign: 'center',
          }}
        >
          ⚠ Reconnecting to server…
        </div>
      )}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden' }}
      />
    </div>
  );
}
