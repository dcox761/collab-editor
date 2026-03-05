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
