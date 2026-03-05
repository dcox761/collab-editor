# Dev Issues Log

Tracking bugs, fixes, and lessons learned during development.

---

## DEV-ISSUE-001: Empty file saved on Ctrl+S

**Date**: 2026-03-05  
**Severity**: High — data loss  
**Status**: Fixed  
**Affected file**: `src/client/hooks/useOpenFiles.ts`

### Symptom
Pressing Ctrl+S to save a document occasionally wrote an empty string to the file, erasing all content. Reproducible by opening a file and pressing Ctrl+S quickly (especially after switching files or editing).

### Root Cause
The `markSaved()` function (and `openFile()`, `closeFile()`) used `setOpenFiles((prev) => { ...; return prev; })` as a way to **read** the current state — a React anti-pattern. Under React 18's automatic batching, `setState` updater functions are deferred to the render phase. When other state updates were pending (e.g., from BlockNote's async `onChange` → `updateContent`), the updater hadn't executed by the time `markSaved` proceeded, so `content` remained `''` (its initial value). This empty string was sent to the server and written to disk.

### Diagnosis
Added `[DEBUG-SAVE]` logging throughout the save pipeline. The logs confirmed:
```
markSaved called for: example/nested-doc.md {fileFound: false, contentLength: 0, contentEmpty: true}
markSaved: file NOT found in openFiles for path: example/nested-doc.md
PUT /api/files/example/nested-doc.md { contentLength: 0, contentEmpty: true }
WARNING: Writing EMPTY content to file: example/nested-doc.md
```

### Fix
Replaced all `setOpenFiles`-as-getter instances with a `useRef` (`openFilesRef`) that mirrors state via `useEffect`. This provides synchronous, always-current reads.

Changes:
- Added `openFilesRef` kept in sync via `useEffect(() => { openFilesRef.current = openFiles; }, [openFiles])`
- `openFile()` — reads `openFilesRef.current` to check if already open (simplified from 4 redundant setState calls to 1 ref read)
- `closeFile()` — reads ref to check dirty state and pick next active tab
- `markSaved()` — reads ref to get file content; added early return if file not found

Safety net: `markSaved()` now returns early without making a server request if the file is not found in state.

### Lesson Learned
Never use `setState(prev => { /* read prev */; return prev; })` to read current state in React 18+. The updater function execution is deferred during batching and is not guaranteed to run synchronously. Use `useRef` mirroring instead for synchronous reads outside of the render cycle.

---

## DEV-ISSUE-002: Lossy markdown formatting on mode toggle

**Date**: 2026-03-05
**Severity**: Medium — unwanted file modifications
**Status**: Fixed
**Affected file**: `src/client/components/Editor/MarkdownEditor.tsx`

### Symptom
Opening a markdown file (e.g. `nested-doc.md`), making a minor edit in rich mode, then switching to source mode and back, caused formatting changes on save:
- List markers changed from `- ` to `*   ` (star + 3 spaces)
- Code fence language specifiers stripped (`` ```javascript `` → `` ``` ``)
- File marked as dirty even when no user edits occurred

### Root Cause
Two interacting problems in `MarkdownEditor.tsx`:

1. **No onChange suppression during programmatic block replacements.** `editor.replaceBlocks()` (called during initial load and source→rich sync) triggers BlockNote's `onChange` callback, which serialized the document via `blocksToMarkdownLossy()` and emitted the lossy output to the parent. This marked the file dirty immediately on open.

2. **Unconditional lossy re-serialization on every mode toggle.** Switching rich→source always called `blocksToMarkdownLossy()`, even if the user made no edits in rich mode. BlockNote's serializer normalizes list markers to `*   ` and may strip code fence language hints, producing different markdown from the original file.

### Fix
Three changes to `MarkdownEditor.tsx`:

1. **`normalizeMarkdown()` post-processor** — A function that runs `blocksToMarkdownLossy()` output through regexes to normalize it. Updated in DEV-ISSUE-005 for BlockNote 0.47 changes. Applied everywhere serialization occurs.

2. **`suppressOnChangeRef`** — A ref that blocks `handleRichChange` from firing during programmatic `replaceBlocks()` calls (initial load and source→rich sync). Uses `setTimeout(() => { suppressOnChangeRef.current = false }, 0)` to re-enable after BlockNote's microtask fires.

3. **`richEditedRef` + `lastMarkdownRef`** — `richEditedRef` tracks whether the user actually typed in rich mode. `lastMarkdownRef` stores the last known canonical markdown (from file load or source-mode edits). When toggling rich→source, if `richEditedRef` is false, the source textarea receives `lastMarkdownRef` instead of a lossy re-serialization. This preserves the original formatting exactly when no rich edits occurred.

### Lesson Learned
BlockNote's `blocksToMarkdownLossy()` is intentionally lossy — it normalizes formatting to its own conventions. When round-trip fidelity matters:
- **Post-process** the output to enforce your preferred conventions (e.g. dash list markers)
- **Avoid unnecessary serialization** — track whether the user actually edited, and skip re-serialization when they didn't
- **Suppress onChange during programmatic mutations** — `replaceBlocks()` triggers onChange just like user edits; gate the handler with a ref

---

## DEV-ISSUE-003: Font files blocked by Vite (403 Forbidden)

**Date**: 2026-03-05
**Severity**: Low — cosmetic (fonts fall back to system defaults)
**Status**: Fixed
**Affected file**: `vite.config.ts`

### Symptom
Browser console showed four `net::ERR_ABORTED 403 (Forbidden)` errors when loading the editor:
```
GET /@fs/tmp/collab-editor-deps/node_modules/@blocknote/core/src/fonts/inter-v12-latin/inter-v12-latin-regular.woff2  403
GET /@fs/tmp/collab-editor-deps/node_modules/@blocknote/core/src/fonts/inter-v12-latin/inter-v12-latin-regular.woff   403
GET /@fs/tmp/collab-editor-deps/node_modules/@blocknote/core/src/fonts/inter-v12-latin/inter-v12-latin-700.woff2      403
GET /@fs/tmp/collab-editor-deps/node_modules/@blocknote/core/src/fonts/inter-v12-latin/inter-v12-latin-700.woff       403
```
The Vite dev server logged: `The request url "/tmp/collab-editor-deps/..." is outside of Vite serving allow list.`

### Root Cause
The devcontainer setup (`postCreateCommand` in `.devcontainer/devcontainer.json`) installs `node_modules` at `/tmp/collab-editor-deps/node_modules` for Docker bind-mount performance and symlinks it into the workspace. Vite's filesystem security (`server.fs.strict`, enabled by default) only allows serving files from the project root and its `node_modules`. Since the real files live under `/tmp/`, Vite follows the symlink, resolves the real path, and blocks access.

### Fix
Added `server.fs.allow` to `vite.config.ts` to explicitly whitelist both the workspace and the symlink target:

```ts
server: {
  fs: {
    allow: ['/workspaces/collab-editor', '/tmp/collab-editor-deps'],
  },
},
```

### Lesson Learned
When `node_modules` is symlinked from an external path (common in Docker for performance), Vite's filesystem security will block access to those files. Always add the real path to `server.fs.allow`.

---

## DEV-ISSUE-004: React forwardRef warning from BlockNote/Mantine

**Date**: 2026-03-05
**Severity**: Low — cosmetic console warning only
**Status**: Fixed — resolved by upgrading to BlockNote 0.47.1 + Mantine 8.x
**Affected packages**: `@blocknote/mantine`, `@blocknote/react`, `@mantine/core`

### Symptom
Console warning on every editor mount:
```
Warning: Function components cannot be given refs. Attempts to access this ref will fail.
Did you mean to use React.forwardRef()?
Check the render method of `ur2`.
```
Stack trace points entirely into minified BlockNote/Mantine internals (`mr2` → `ur2` → `dr2` inside `@blocknote/react`).

### Root Cause
An internal Mantine component used by BlockNote's toolbar/menu system is a function component that receives a ref without wrapping in `React.forwardRef()`. This is inside the library code — our `MarkdownEditor` component does not pass any ref to `BlockNoteView`.

### Fix
Upgraded all packages together:

| Package | Before | After |
|---------|--------|-------|
| `@blocknote/core` | 0.24.2 | 0.47.1 |
| `@blocknote/react` | 0.24.2 | 0.47.1 |
| `@blocknote/mantine` | 0.24.2 | 0.47.1 |
| `@mantine/core` | 7.17.4 | 8.3.x |
| `@mantine/hooks` | — | 8.3.x (new peer dep) |
| `@mantine/utils` | — | 6.0.x (new peer dep) |

API changes adapted in `MarkdownEditor.tsx`:
- `tryParseMarkdownToBlocks()` — now **synchronous** (was async/Promise in 0.24)
- `blocksToMarkdownLossy()` — now **synchronous** (was async/Promise in 0.24)
- `onChange` callback — now receives `(editor, context)` instead of `() => void`
- Removed all `async`/`await` from methods that called these APIs
- `MantineProvider` in `main.tsx` — no changes needed (basic usage is backward-compatible)

### Lesson Learned
When upgrading across many minor versions (0.24 → 0.47), check for sync/async API signature changes. TypeScript will catch return-type mismatches, but `await`ing a synchronous function silently works (it wraps the value in a resolved Promise), so extra `await`s won't cause build errors but add unnecessary overhead.

---

## DEV-ISSUE-005: Lossy markdown regression after BlockNote 0.47 upgrade

**Date**: 2026-03-05
**Severity**: Medium — unwanted file modifications on save
**Status**: Fixed
**Affected file**: `src/client/components/Editor/MarkdownEditor.tsx`

### Symptom
After upgrading BlockNote from 0.24 to 0.47 (DEV-ISSUE-004), the `normalizeMarkdown()` function no longer corrected all lossy output. Saving after a Rich→Source→Rich round-trip produced these diffs:

- `- text` → `* text` (star + single space, not the old star + 3 spaces)
- Extra blank lines inserted between consecutive list items
- Bare ` ``` ` code fences gained a `text` language hint: ` ```text `

### Root Cause
BlockNote 0.47's `blocksToMarkdownLossy()` changed its output format compared to 0.24:

1. **List markers**: 0.24 emitted `*   ` (star + 3 spaces); 0.47 emits `* ` (star + 1 space). The old regex `/^(\s*)\*   /gm` no longer matched.
2. **List item spacing**: 0.47 treats list items as block paragraphs, adding blank lines between them. The original normalizer had no rule for this.
3. **Code fence language**: 0.47 adds `text` as a default language specifier on bare code fences. The original normalizer didn't strip it.

### Fix
Updated `normalizeMarkdown()` with three rules:

```ts
function normalizeMarkdown(md: string): string {
  let result = md;
  // Convert star-based unordered list markers to dashes (handle both "* " and "*   ")
  result = result.replace(/^(\s*)\*(\s{1,3})/gm, '$1- ');
  // Remove blank lines between consecutive list items
  result = result.replace(/^(\s*- .+)\n\n(?=\s*- )/gm, '$1\n');
  // Strip "text" language hint from code fences (```text → ```)
  result = result.replace(/^```text$/gm, '```');
  return result;
}
```

### Lesson Learned
When upgrading rich-text editor libraries, the lossy serializer output format may change subtly between versions. Any post-processing normalizer must be re-validated against the new output. Integration-test the round-trip (original markdown → parse → serialize → normalize → compare) after every editor library upgrade.

---

## DEV-ISSUE-006: Tab switching lost unsaved edits

**Date**: 2026-03-05
**Severity**: High — data loss
**Status**: Fixed
**Affected file**: `src/client/components/Editor/EditorPanel.tsx`

### Symptom
Switching between tabs discarded any unsaved edits. The user would type in one tab, switch to another, then switch back to find their changes gone.

### Root Cause
`EditorPanel` passed the `savedContent` prop (last content written to disk) to the editor instead of the working `content` (which includes unsaved edits). Every tab switch re-rendered the editor with the on-disk version, discarding in-memory changes.

### Fix
Changed the prop passed to the editor from `savedContent` to the working `content` held in the open-files state, so that unsaved edits are preserved across tab switches.

### Lesson Learned
Always distinguish between "last saved content" and "current working content" in editor state. The editor should always receive the working copy; the saved copy is only needed for dirty-state comparison and save operations.

---

## DEV-ISSUE-007: Rich mode typing duplicated characters

**Date**: 2026-03-05
**Severity**: High — unusable editor
**Status**: Fixed
**Affected file**: `src/client/components/Editor/MarkdownEditor.tsx`

### Symptom
Typing in Rich (BlockNote) mode produced duplicate characters. For example, typing "hello" would render "hheelllloo" or similar repeated input.

### Root Cause
A `useEffect` with dependencies `[content, editor]` called `editor.replaceBlocks()` to sync content into the editor. Since every keystroke triggered BlockNote's `onChange` → updated `content` state → re-triggered the effect → called `replaceBlocks()` again with the just-typed content, the editor received a programmatic replacement on every keystroke, causing duplication.

### Fix
Replaced the `[content, editor]` effect with an `initialContentRef` pattern. Content is only loaded into the editor via `replaceBlocks()` when the `editor` instance is first available (dependency: `[editor]` only). Subsequent user edits flow out via `onChange` but never loop back through `replaceBlocks()`.

### Lesson Learned
Never put an editor's content state in the dependency array of an effect that writes back to the editor — this creates a render loop. Use a ref to track initial load and only push content into the editor programmatically once (on mount or on explicit external change like tab switch).

---

## DEV-ISSUE-008: Source→Rich mode didn't update editor content

**Date**: 2026-03-05
**Severity**: Medium — stale content displayed
**Status**: Fixed
**Affected file**: `src/client/components/Editor/MarkdownEditor.tsx`

### Symptom
After editing in Source (textarea) mode and switching back to Rich (BlockNote) mode, the editor still displayed the old content. The source-mode edits were not reflected in the rich editor.

### Root Cause
`replaceBlocks()` was called immediately when the mode switched to Rich, but `BlockNoteView` had not yet mounted at that point. The blocks were replaced on an editor instance that wasn't attached to the DOM, so the visual update was lost.

### Fix
Introduced a `pendingMarkdownRef` that stores the markdown to load when switching to Rich mode. A `useEffect` with dependencies `[mode, editor]` checks the ref after mount and calls `replaceBlocks()` only when BlockNoteView is actually rendered. This defers the block replacement to the first render cycle after the mode switch.

### Lesson Learned
When conditionally rendering editor components (e.g., toggling between textarea and BlockNote), any programmatic content updates must be deferred until after the target component has mounted. Use a pending-content ref pattern and sync in a `useEffect` that runs after render.
