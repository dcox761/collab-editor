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
