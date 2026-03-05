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

1. **`normalizeMarkdown()` post-processor** — A function that runs `blocksToMarkdownLossy()` output through a regex to convert `*   ` list items back to `- ` (the common convention). Applied everywhere serialization occurs.

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
