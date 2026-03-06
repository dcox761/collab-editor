# Collaborative AI Editor — Requirements Summary

## 1. Overview

A self-hosted, open source collaborative document editor with an integrated AI assistant and Git version control. Multiple users can simultaneously edit Markdown documents while an AI participant can review, provide feedback, and make targeted edits via a side chat panel.

## 2. Constraints

- 100% open source and free
- Self-hosted
- Deployed via Docker Compose
- No proprietary dependencies
- Desktop browser only (mobile/tablet not required initially)
- Initial deployment is localhost; production access via VPN only (not public internet)
- Minor Markdown formatting loss is acceptable for complex features (tables, footnotes, HTML blocks)
- Documents should use standard Markdown; avoid advanced or exotic features

### 2.1 Authentication & Access

- **Initial phase**: No login required; users enter a display name stored in browser local storage
- **Future phase**: Authentication via local Active Directory / LDAP server
- No per-user permissions initially (all users have full read/write access)
- No per-document access restrictions initially

## 3. Technology Stack

| Component | Technology | License |
|---|---|---|
| Editor | BlockNote | MPL-2.0 |
| Real-time collaboration | Y.js + y-websocket | MIT |
| Server | Node.js / Express | MIT |
| AI integration | OpenAI-compatible endpoint | - |
| Git operations | isomorphic-git | MIT |
| Git server | Forgejo (or any Git host) | MIT |
| Containerisation | Docker Compose | Apache 2.0 |

## 4. Deployment

### 4.1 Containers
- **App container**: Editor, Y.js sync server, AI bridge, Git operations
- **Forgejo container**: Self-hosted Git repository server (optional — any remote Git host is supported)

### 4.2 Volumes
- **repo**: Sparse checkout working directory for the app
- **forgejo**: Forgejo data including repositories, database, and configuration

### 4.3 Networking
- App and Forgejo communicate via internal Docker network
- App connects to Ollama on host machine via host.docker.internal
- App web UI exposed on port 3000
- Forgejo web UI exposed on port 3001

### 4.4 Configuration
All configuration via environment variables:

| Variable | Purpose | Example |
|---|---|---|
| AI_BASE_URL | AI endpoint URL | http://host.docker.internal:11434/v1 |
| AI_API_KEY | API key (optional for Ollama) | sk-... or blank |
| AI_MODEL | Model name | llama3.1:70b |
| GIT_REMOTE_URL | Git repository URL | http://forgejo:3000/user/project.git |
| GIT_USERNAME | Git auth username | bot |
| GIT_TOKEN | Git auth token | token123 |
| GIT_AUTHOR_NAME | Name for commits | AI Collaborator |
| GIT_AUTHOR_EMAIL | Email for commits | bot@local |
| GIT_SPARSE_PATH | Subdirectory to work with | docs/ |
| GIT_BRANCH | Branch to work on | main |
| GIT_PULL_INTERVAL | Seconds between remote change checks | 60 |

### 4.5 Initial Setup
- The Forgejo repository must be created manually before first run (no auto-provisioning)
- The app connects to a pre-existing remote repository on startup

## 5. User Interface

### 5.1 Layout
Three-panel layout in a single browser window (desktop only):
- **Left panel**: File browser sidebar
- **Centre panel**: Document editor with tabs for multiple open files
- **Right panel**: AI chat sidebar

### 5.2 File Browser
- Lists all documents within the configured sparse checkout path
- Supports nested folders
- Create, rename, and delete files and folders
- Click to open files into editor tabs
- Single sparse path initially (multiple paths not supported)

### 5.3 Editor
- Block-based Markdown editor (BlockNote)
- **Rich/Source mode toggle**: switch between WYSIWYG block editor and raw markdown textarea per tab
  - Rich mode: BlockNote WYSIWYG editor (default)
  - Source mode: monospace textarea for direct markdown editing
  - Content syncs bidirectionally on mode switch
  - Future: Source mode upgrades to CodeMirror 6 with Yjs collaborative editing (see `plans/source-mode-plan.md`)
- Real-time collaborative editing across multiple simultaneous users
- Tab bar for switching between multiple open documents
- Unsaved edits preserved when switching between tabs (working content, not just last-saved content)
- Each document is a separate Y.js collaboration room
- User presence list showing who is currently connected

### 5.4 Chat Panel
- Scrollable chat history
- Text input with send button
- Context-aware: scoped to the currently active document tab
- Streams AI responses in real time
- Chat history is per-user and stored in browser local storage (not shared between users)
- Chat history persists across browser refreshes
- Users who join later do not see previous chat — only the Markdown document is shared

## 6. Data & Persistence

### 6.1 Source of Truth
- Markdown files on disk are the source of truth
- Y.js in-memory state is a collaborative editing layer that persists to disk

### 6.2 Save Behaviour
- **Phase 1a**: Manual save only — user presses Ctrl+S (Cmd+S on Mac) to persist the current document to disk. Unsaved changes are indicated by a ● dot on the tab. Closing a dirty tab prompts the user to confirm discarding changes. Changes are lost on page reload if not saved.
- **Phase 1b+**: Y.js state is saved to Markdown files on disk every 5 seconds if changes have been made
- Minimise data loss on server crash; the 5-second save interval is the maximum acceptable loss window

## 7. AI Integration

### 7.1 Endpoint
- Uses any OpenAI-compatible API endpoint
- Supports Ollama, Claude API, or any compatible provider
- API key is optional to support Ollama without authentication
- When AI/Ollama is unavailable: display an error message and allow the user to retry

### 7.2 Document Interaction
- AI reads the current document content as context
- AI can cross-reference other open documents when requested
- AI makes surgical edits to specific blocks/sections via Y.js operations
- Edits appear to other users as real-time changes (concurrent human and AI edits are both visible in real time)
- AI never replaces the entire document for an edit
- AI conversation stays in the chat panel, not in the document

### 7.3 Context Management
- Include as much chat history as possible in each AI request context
- When a document exceeds the model context limit: show a warning to the user with an option to send a summarised version instead
- AI requests are queued (not parallel); when a request is waiting, show a "waiting" indicator to other users

### 7.4 System Prompt & Persona
- Use an Architect persona as the default system prompt
- Configurable system prompts are deferred to a future phase

### 7.5 Audit Trail
- Log AI requests and the changes they produce for accountability
- Storage mechanism to be determined during implementation

### 7.6 Chat Capabilities
- Answer questions about the document
- Review specific sections and provide feedback
- Make targeted edits when requested
- Generate document templates from AI

## 8. Git Integration

### 8.1 Repository Scope
- Sparse checkout of a configurable subdirectory
- Only files within the configured path are visible and editable
- Commits only affect files within the configured path
- App works directly with the sparse checkout as its working directory (single volume)
- Supports any Git remote: Forgejo, GitHub, Azure DevOps, or any standard Git host
- Single repository per deployment (no multi-repo support)

### 8.2 Operations via AI Chat Commands
- Commit single file or all changed files with a message
- Push to remote
- Pull from remote
- Show diff since last commit
- Show git log
- Create branches
- Rollback to previous versions
- Summarise changes between versions (AI-generated)

### 8.3 Workflow
- Developers can work with the full repo outside this tool
- Doc changes made in the editor appear in the full repo after commit/push
- Doc changes made by developers appear in the editor after pull
- No dedicated branch required — works on any configured branch

### 8.4 Merge Conflicts
- On pull, if merge conflicts are detected, present both versions to the user for manual resolution

### 8.5 Remote Sync
- Periodically check the remote for new changes (configurable interval via GIT_PULL_INTERVAL)
- When new remote changes are detected, prompt the user to pull (do not auto-merge)

## 9. Build Phases

### Phase 1a — Single-User Editor in Docker

Core goal: get a working Markdown editor running in a browser via Docker as quickly as possible.

| Step | Deliverable |
|---|---|
| 1a.1 | Docker Compose with a single App container serving a web UI on port 3000 |
| 1a.2 | BlockNote Markdown editor: open, edit, and save a single document to disk |
| 1a.3 | File browser sidebar listing Markdown files in the working directory |
| 1a.4 | Multi-document tab support: open multiple files, switch between tabs |

**Phase 1a outcome**: One user can open the app in a browser, browse files, open documents in tabs, and edit/save Markdown files.

### Phase 1b — Real-Time Collaboration

Core goal: add multi-user collaborative editing so changes appear in real time across browsers.

| Step | Deliverable |
|---|---|
| 1b.1 | Y.js integration with y-websocket for real-time sync between multiple browser sessions |
| 1b.2 | Each document tab backed by a separate Y.js collaboration room |
| 1b.3 | 5-second periodic save from Y.js state to Markdown files on disk |
| 1b.4 | User presence list showing who is currently connected |

**Phase 1b outcome**: Multiple users can open the same document and see each other's edits in real time, with changes persisted to disk every 5 seconds.

### Phase 1c — AI Chat Integration

Core goal: add the AI chat sidebar so users can converse with an AI that reads and edits the document.

| Step | Deliverable |
|---|---|
| 1c.1 | Chat panel UI: scrollable history, text input, send button, scoped to active document tab |
| 1c.2 | Chat history persistence in browser local storage |
| 1c.3 | AI backend: connect to OpenAI-compatible endpoint, stream responses to chat panel |
| 1c.4 | AI document reading: send current document content and chat history as context |
| 1c.5 | AI context management: queuing with waiting indicator, context-limit warning with summarise option |
| 1c.6 | AI surgical editing: AI makes targeted edits to document blocks via Y.js operations |

**Phase 1c outcome**: Multiple users can collaboratively edit Markdown documents and chat with an AI that reads the document, answers questions, and makes targeted edits — all visible in real time. No Git dependency.

### Phase 2 — Git Integration & Polish

Core goal: add Git version control, remote sync, and remaining features.

| Step | Deliverable |
|---|---|
| 2.1 | Docker Compose updated to add Forgejo container |
| 2.2 | Git sparse checkout and repository connection |
| 2.3 | Basic Git operations: commit, push, pull, diff, log |
| 2.4 | Merge conflict detection and resolution UI |
| 2.5 | Periodic remote sync with user prompt to pull |
| 2.6 | AI git commands via chat: commit, push, pull, branch, rollback, summarise changes |
| 2.7 | AI audit trail logging |

**Phase 2 outcome**: Full Git-backed collaborative editor with AI-assisted version control operations.

## 10. Future Considerations

The following features are acknowledged but out of scope for the initial build:

| Feature | Notes |
|---|---|
| LDAP/AD authentication | Future phase after initial browser-storage identity |
| Per-user permissions and document restrictions | Not initially required |
| Mobile/tablet responsive layout | Desktop only for now |
| Multiple sparse checkout paths | Single path initially |
| Document templates | AI-generated, deferred to future |
| Export to PDF/DOCX | Not initially required |
| AI personas with configurable system prompts | Architect persona only initially |
| Backup strategy for uncommitted work | Out of scope |

---

## Further Clarification Required

### Authentication & Access
1. Is this LAN-only or internet-facing? Could be either, will test localhost initially. May only provide by VPN.
2. Are user accounts and login needed? When local or VPN, store name in browser storage. Future by authenticating local AD server. LDAP?
3. Should different users have different permissions (e.g. read-only)? Not initially
4. Should certain documents be restricted to certain users? Not initially

### Data & Persistence
5. What is the source of truth — Y.js in-memory state or Markdown files on disk? Markdown on disk
6. When should Y.js state be saved to disk (periodic, on idle, on disconnect)? Every 5sec if changed
7. What happens if the server crashes mid-edit — how much data loss is acceptable? As little should be lost as possible
8. Should chat history persist across browser refreshes and server restarts? Yes use browser storage
9. Should users who join later see previous chat history? No individual chat. Only Markdown doc is shared

### Markdown Fidelity
10. BlockNote's internal format may not perfectly round-trip complex Markdown (tables, footnotes, HTML blocks). Is some loss of formatting acceptable? Yes if required
11. Are documents pure Markdown or do they use advanced features? Avoid too many advanced features

### AI Behaviour
12. How should large documents be handled when they exceed model context limits — send full document, relevant section only, or summarised context? Show a warning and option to summarise
13. How much chat history should be included as context for each AI request? As much as possible
14. What happens when two users ask the AI something simultaneously — queue or parallel? queue, show waiting if possible
15. What if AI is editing a section while a user is also editing it? Can they both see changes at same time. 
16. Should the AI system prompt be configurable (e.g. different personas for different document types)? Architect persona initially
17. Should there be an audit trail of AI requests and changes? Good idea

### Git
18. Should the app auto-create the Forgejo repo on first run or is manual setup acceptable? Manual setup
19. Will you need to connect to more than one repository? No but support any repo including GitHub or Azure DevOps
20. Should the editor work on a dedicated branch (e.g. docs/updates) to avoid affecting CI/CD? No
21. How should merge conflicts from pull be handled? User to see both and merge
22. Should pull support be automatic/periodic or only on-demand? Periodic check and prompt

### UI/UX
23. Desktop-only or does it need to work on mobile/tablet? Desktop or now
24. Should there be presence indicators showing who else is editing (coloured cursors, user list)? User list if possible
25. Should the file browser support multiple sparse paths? Not initially

### Features for Later Consideration
26. Document templates (pre-built or AI-generated) - AI generated
27. Export to PDF or DOCX - Not initially
28. AI personas with configurable system prompts - Not initially
29. Backup strategy for uncommitted work - Out of scope
30. Graceful degradation when AI/Ollama is unavailable - show error message and allow retry

---

## Phase 1A — Implementation Log

### Date: 2 March 2026

### Overview

Phase 1A delivered a single-user Markdown editor running in Docker with an Express+TypeScript backend, React+BlockNote frontend, file browser sidebar, and multi-document tab support. All acceptance criteria from `plans/phase-1a-plan.md` were met.

### Issues Encountered & Resolutions

#### 1. Node.js Not Available in Devcontainer

**Problem**: The devcontainer environment did not have Node.js installed. Running `npm install` failed with `npm: not found`.

**Resolution**: Added Node.js 20 LTS installation to `.devcontainer/Dockerfile` via the NodeSource apt repository:
```dockerfile
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs
```

Node.js is now always available when the devcontainer is built.

**Lesson**: Don't assume runtime availability in devcontainers — add required runtimes to the `.devcontainer/Dockerfile` so the environment is reproducible.

#### 2. Slow Mapped Filesystem for node_modules

**Problem**: The devcontainer workspace directory is bind-mounted from the host, which is very slow for the thousands of small files in `node_modules`. Running `npm install` directly in the workspace would be painfully slow and impact builds.

**Resolution**: Configured `devcontainer.json` with a `postCreateCommand` that installs dependencies in `/tmp/collab-editor-deps` (Docker filesystem — fast) and creates a symlink into the workspace:
```jsonc
// .devcontainer/devcontainer.json
"postCreateCommand": "mkdir -p /tmp/collab-editor-deps && cp package.json package-lock.json /tmp/collab-editor-deps/ && cd /tmp/collab-editor-deps && npm install && ln -sf /tmp/collab-editor-deps/node_modules ${containerWorkspaceFolder}/node_modules"
```

This runs automatically when the devcontainer is created. To manually re-install after changing `package.json`:
```bash
cp package.json package-lock.json /tmp/collab-editor-deps/
cd /tmp/collab-editor-deps && npm install
```

**Trade-off**: The symlink is ephemeral — if the devcontainer is rebuilt, the `postCreateCommand` re-runs automatically. The `package.json` and `package-lock.json` remain in the workspace for Git tracking.

**Lesson**: For bind-mounted filesystems in devcontainers, always relocate `node_modules` to the Docker filesystem (`/tmp` or similar) and use the `postCreateCommand` to automate the setup.

#### 3. VS Code Port Forwarding Conflict with Docker Port Mapping

**Problem**: The devcontainer uses Docker-from-Docker (host Docker socket mounted at `/var/run/docker.sock`). When running `docker compose up` with `ports: "3000:3000"`, the app was not reachable from the host at `localhost:3000`. The container was running correctly (verified via `docker exec` from inside the container).

**Root cause**: VS Code Dev Containers monitors the Docker socket and auto-detects exposed/published ports on sibling containers. It then sets up its own port forwarding, which conflicts with Docker's native `ports` host binding. The two forwarding mechanisms clash, preventing either from working correctly.

**Resolution**: Two changes:
1. Kept Docker's native `ports: "3000:3000"` mapping in `docker-compose.yml` for direct host access
2. Added `portsAttributes` to `.devcontainer/devcontainer.json` to tell VS Code to **ignore** port 3000:
   ```jsonc
   "portsAttributes": {
     "3000": {
       "label": "Collab Editor",
       "onAutoForward": "ignore"
     }
   }
   ```

With VS Code's auto-forwarding disabled for port 3000, Docker's native port mapping works as expected and the app is accessible from the host at `http://localhost:3000`.

**Lesson**: When using Docker-from-Docker in a devcontainer, VS Code's automatic port forwarding can conflict with Docker's native `ports` mapping. Use `"onAutoForward": "ignore"` in `portsAttributes` for ports managed by sibling containers to prevent the conflict.

#### 4. BusyBox wget Limitations in Alpine

**Problem**: The Docker image uses Alpine Linux, which ships BusyBox `wget` instead of GNU wget. BusyBox `wget` does not support `--method=PUT` or `--method=DELETE`, making it impossible to test PUT/DELETE/PATCH API endpoints with `wget`.

**Resolution**: Used Node.js `fetch()` (available in Node 20) from inside the container to test all HTTP methods:
```bash
docker compose exec app node /tmp/test-api.mjs
```

**Lesson**: For API testing in Alpine containers, use `node -e` with `fetch()` rather than relying on BusyBox `wget`. Alternatively, install `curl` in the Docker image if comprehensive HTTP testing is needed.

#### 5. TypeScript Module Resolution Strategy

**Problem**: The project needs two separate TypeScript configurations — one for the Vite-bundled client (React JSX, ESM, `noEmit`) and one for the server (CommonJS output to `dist/server`). Using a single `tsconfig.json` would create conflicts.

**Resolution**: Created two configs:
- `tsconfig.json` — Client-side: `jsx: react-jsx`, `moduleResolution: bundler`, `noEmit: true` (Vite handles bundling)
- `tsconfig.server.json` — Server-side: `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist/server`, `rootDir: src/server`

The server build uses `tsc -p tsconfig.server.json` and the client build uses `vite build`.

**Lesson**: Multi-target TypeScript projects should use separate `tsconfig` files from the start to avoid configuration conflicts.

### Files Created

| File | Purpose |
|------|---------|
| `README.md` | Build, deploy, and development documentation |
| `Dockerfile` | Multi-stage build: builder + production |
| `docker-compose.yml` | Single app service, port 3000, named docs volume |
| `.env` | `DOCS_PATH=/app/docs`, `PORT=3000` |
| `docker-entrypoint.sh` | Seeds docs volume with sample files |
| `package.json` | Dependencies and build scripts |
| `tsconfig.json` | Client TypeScript config |
| `tsconfig.server.json` | Server TypeScript config |
| `vite.config.ts` | Vite bundler config with API proxy |
| `.devcontainer/Dockerfile` | Devcontainer: Ubuntu + Node.js 20 + Docker CLI |
| `.devcontainer/devcontainer.json` | Devcontainer config with /tmp node_modules setup |
| `src/server/index.ts` | Express server entry point |
| `src/server/routes/files.ts` | REST API routes for file operations |
| `src/server/services/fileService.ts` | Filesystem service with path traversal protection |
| `src/client/index.html` | SPA entry point |
| `src/client/main.tsx` | React entry with MantineProvider |
| `src/client/App.tsx` | Root layout with three panels |
| `src/client/styles/global.css` | All component styles |
| `src/client/hooks/useFileTree.ts` | File tree data fetching hook |
| `src/client/hooks/useOpenFiles.ts` | Open tabs state management hook |
| `src/client/components/Editor/MarkdownEditor.tsx` | BlockNote editor wrapper |
| `src/client/components/Editor/EditorPanel.tsx` | Tab bar + active editor panel |
| `src/client/components/Editor/TabBar.tsx` | Tab bar component |
| `src/client/components/Editor/Tab.tsx` | Single tab with dirty indicator |
| `src/client/components/FileBrowser/FileBrowser.tsx` | File tree sidebar |
| `src/client/components/FileBrowser/FileTreeItem.tsx` | Recursive tree node |
| `src/client/components/FileBrowser/NewFileDialog.tsx` | New file/folder dialog |
| `src/client/components/ChatPanel/ChatPanel.tsx` | Placeholder for Phase 1c |
| `docs/welcome.md` | Sample welcome document |
| `docs/example/nested-doc.md` | Sample nested document |
| `.gitignore` | Ignores node_modules, dist, logs |
| `.dockerignore` | Ignores node_modules, dist, .git |

### Test Results (All Passing)

| Test | Method | Result |
|------|--------|--------|
| File tree listing | `GET /api/tree` | ✅ Returns dirs + .md files recursively |
| Read file | `GET /api/files/welcome.md` | ✅ Returns content |
| Read nested file | `GET /api/files/example/nested-doc.md` | ✅ Returns content |
| Create file | `PUT /api/files/test.md` | ✅ Creates and returns success |
| Rename file | `PATCH /api/files/test.md` | ✅ Renames successfully |
| Delete file | `DELETE /api/files/test.md` | ✅ Removes file |
| Create directory | `POST /api/files/folder (type: dir)` | ✅ Creates directory |
| Path traversal blocked | `GET /api/files/..%2F..%2Fetc%2Fpasswd` | ✅ HTTP 400 |
| SPA serving | `GET /` | ✅ Returns index.html |
| Docker build | `docker compose build` | ✅ Multi-stage build succeeds |
| Docker run | `docker compose up` | ✅ Container starts, server runs on :3000 |
| Volume seeding | Entrypoint script | ✅ Sample docs created on first run |

#### 6. Rich/Source Mode Toggle

**Feature**: Added a toggle button in the editor toolbar that switches between BlockNote WYSIWYG (Rich) mode and a raw markdown textarea (Source) mode. Each tab independently tracks its own mode.

**Implementation**:
- `MarkdownEditor.tsx` gained `mode` state (`'rich' | 'source'`), a segmented toggle button, and a monospace `<textarea>` for source mode
- Toggle syncs content bidirectionally: Rich→Source via `blocksToMarkdownLossy()`, Source→Rich via `tryParseMarkdownToBlocks()`
- Tab key in source mode inserts 2 spaces instead of changing focus
- CSS styles added for `.editor-mode-toggle`, `.mode-toggle-btn`, `.source-textarea`
- Zero new dependencies

**Future upgrade path**: Plain textarea will be replaced with CodeMirror 6 + `y-codemirror.next` when Yjs collaboration is added in Phase 1b. Full plan documented in `plans/source-mode-plan.md`.

#### 7. Tab-Switching Content Loss Bug

**Problem**: Switching tabs lost unsaved edits. `EditorPanel.tsx` passed `activeFile.savedContent` (last Ctrl+S state) to the `MarkdownEditor` content prop. Since `key={activeFile.path}` forces a full remount on tab switch, the editor was always reinitialized with the last-saved version, discarding any unsaved changes.

**Resolution**: Changed `content={activeFile.savedContent}` to `content={activeFile.content}` in `EditorPanel.tsx`. The `content` field in `useOpenFiles` state tracks the latest working content (updated on every `onChange`), while `savedContent` only updates on Ctrl+S. Now switching tabs preserves the current editing state.

**Lesson**: When React components use a `key` prop that causes remounting, ensure the content prop reflects the latest state, not a stale snapshot.

#### 8. Rich Mode Typing Duplication Bug

**Problem**: Typing in Rich mode duplicated characters — the first character appeared correctly, then subsequent characters were appended to the end of the document. The root cause was a `useEffect` with dependencies `[content, editor]` that called `editor.replaceBlocks()` to load content. Because `content` was a prop that updated on every `onChange` event, the effect re-ran on every keystroke, resetting the editor to the markdown-serialized version of itself and losing cursor position.

**Resolution**: Introduced `initialContentRef = useRef(content)` to capture the initial content value at mount time. Changed the `useEffect` dependency to `[editor]` only, so it runs exactly once per file (the component remounts via `key={path}` on file switch). The editor now loads content once and never re-replaces blocks from outside.

**Lesson**: In BlockNote, `editor.replaceBlocks()` must never be called in response to the editor's own changes. Use a ref to capture initial state and restrict load effects to mount-only.

#### 9. Source→Rich Mode Sync Bug

**Problem**: After editing in Source mode and switching back to Rich mode, the Rich view still showed the old content. The toggle handler was calling `editor.replaceBlocks()` *before* `setMode('rich')`, but since `BlockNoteView` is conditionally rendered (`mode === 'rich'`), the view was not yet mounted when blocks were replaced. The replacement was silently discarded.

**Resolution**: Introduced `pendingMarkdownRef = useRef<string | null>(null)`. The Source→Rich toggle now queues the markdown in the ref and calls `setMode('rich')`. A separate `useEffect` on `[mode, editor]` detects when `mode === 'rich'` and `pendingMarkdownRef.current !== null`, then applies the deferred block replacement after `BlockNoteView` has mounted.

**Lesson**: When React conditionally renders a component (like `BlockNoteView`), any imperative operations on that component must be deferred until after the render cycle completes. The ref-queue + useEffect pattern is the idiomatic solution.

#### 10. Phase 1a Save Behaviour Clarification

**Observation**: User reported "changes are lost on reload." This is expected Phase 1a behaviour — save is manual via Ctrl+S only. The save flow is fully functional: `Ctrl+S` → `EditorPanel` keydown handler → `markSaved()` → `PUT /api/files/${path}` → server writes to disk. Unsaved changes show a ● dirty indicator on the tab, and closing a dirty tab prompts for confirmation. Auto-save (5-second periodic from Y.js state) is deferred to Phase 1b.

---

## Minor Improvements — Implementation Log

### Date: 6 March 2026

### Overview

A batch of quality-of-life improvements requested in `docs/MINOR-IMPROVEMENTS.md`: file browser refresh button, resizable panels, username prompt with multi-window support, and scroll/cursor preservation on Source↔Preview toggle.

### 11. File Browser Refresh Button

**Feature**: Added a 🔄 refresh button in the file browser header bar, positioned before the New File and New Folder buttons.

**Implementation**: Single button added to `FileBrowser.tsx` that calls the existing `refresh` prop (from `useFileTree`). No new dependencies or state.

**Files changed**: `src/client/components/FileBrowser/FileBrowser.tsx`

### 12. Resizable Panel Layout

**Feature**: Left (file browser) and right (chat) panels can be resized by dragging a vertical handle between them and the centre editor panel. Panels have a minimum width of 150px.

**Implementation**:
- Created `ResizeHandle.tsx` — a generic vertical drag handle that captures pointer events on mousedown and fires `onResize(deltaX)` callbacks during mousemove
- `App.tsx` manages `leftWidth` and `rightWidth` state (defaults: 250px, 300px) and passes resize handlers to two `ResizeHandle` instances
- Side panels switched from fixed CSS `width` to inline `style={{ width }}` with `flex-shrink: 0`
- CSS `.resize-handle` class: 5px wide, transparent until hover/active (turns indigo `#4f46e5`)
- `cursor: col-resize` applied to `document.body` during drag and `user-select: none` prevents text selection during resize

**Files created**: `src/client/components/ResizeHandle.tsx`
**Files changed**: `src/client/App.tsx`, `src/client/styles/global.css`

### 13. Username Prompt, Storage & Change Dialog

**Feature**: On first visit (no stored identity), a modal dialog prompts the user for a display name. The name and a random colour are stored in `localStorage` under `collab-editor-identity`. A "👤 Username" button in the editor toolbar lets users change their name at any time.

**Implementation**:
- Rewrote `useUserIdentity.ts`:
  - No longer requires an `Awareness` argument — it became a pure identity/session hook
  - Returns `needsPrompt` (true when no stored identity), `dismissPrompt()`, `showChangeDialog`, `setShowChangeDialog`
  - `loadStoredIdentity()` returns `null` (not a generated fallback) when localStorage is empty, triggering the prompt
- Created `UsernameDialog.tsx` — reusable modal with auto-focus input, Enter/Escape handling, min-length validation
- `App.tsx` renders both the first-visit prompt and the change-name dialog, gated by `needsPrompt` and `showChangeDialog`
- `EditorPanel.tsx` accepts `sessionName` and `onChangeUsername` props, renders the username button in the toolbar
- Identity is published to Y.js awareness in `EditorPanel.tsx` via `awareness.setLocalStateField('user', ...)`, reading colour from localStorage

**Files created**: `src/client/components/UsernameDialog.tsx`
**Files changed**: `src/client/hooks/useUserIdentity.ts`, `src/client/App.tsx`, `src/client/components/Editor/EditorPanel.tsx`, `src/client/styles/global.css`

### 14. Multi-Window Same-User Detection

**Feature**: If the same user (same `localStorage` identity) opens the app in multiple tabs/windows, subsequent tabs get an auto-generated suffix like "Alice (2)", "Alice (3)". The suffix is NOT saved to `localStorage` — only the session display name is affected.

**Implementation**:
- Each tab generates a unique `sessionId` via `crypto.randomUUID()` (stored in a ref, not persisted)
- Uses `BroadcastChannel('collab-editor-presence')` to coordinate between same-origin tabs:
  - On mount: sends `{ type: 'hello', sessionId, baseName }`, other tabs respond with `{ type: 'here', ... }`
  - On name change: channel re-initialises (effect depends on `identity.name`)
  - On unmount/beforeunload: sends `{ type: 'bye', sessionId, ... }`
- `sessionName` is computed by sorting all session IDs with the same base name — the first (lexicographically) gets the plain name, others get a numeric suffix
- Private/incognito windows have separate `localStorage`, so they naturally get a different identity with no suffix collision

**Design decisions**:
- `BroadcastChannel` is same-origin only, which is exactly what we need (same app, same localStorage)
- The suffix is ephemeral — closing the suffixed tab immediately frees the suffix
- If `BroadcastChannel` is unavailable (very old browsers), multi-window detection silently degrades — no suffix is added

**Files changed**: `src/client/hooks/useUserIdentity.ts`

### 15. Scroll & Cursor Position Preservation on Source↔Preview Toggle

**Feature**: When switching between Source and Preview modes, the editor preserves its scroll position and cursor location instead of resetting to the top of the document.

**Implementation**:
- Previously, `EditorPanel` conditionally rendered either `SourceEditor` or `PreviewPanel` — switching modes unmounted one and mounted the other, destroying CodeMirror's internal state
- Changed to a **dual-mount strategy**: both Source and Preview are rendered simultaneously once first activated, but the inactive one is hidden via `display: none`
- `hasShownSource` and `hasShownPreview` state flags track whether each view has been activated at least once — views are only mounted on first activation (lazy), then kept alive
- Hidden with inline `style={{ display: viewMode === 'source' ? 'flex' : 'none' }}` rather than conditional rendering
- CSS `.editor-view-container` uses `position: absolute; inset: 0` so both views overlay the same space
- When switching files, both flags reset and viewMode resets to 'source'

**Trade-off**: Both views stay in the DOM and consume memory while the file is open. For a desktop editor this is negligible. The `PreviewPanel` still observes Y.Text changes in the background (debounced 300ms), keeping it up to date when revealed.

**Future**: Side-by-side Source+Preview mode and synchronized scroll position between the two views are noted as future enhancements.

**Files changed**: `src/client/components/Editor/EditorPanel.tsx`, `src/client/styles/global.css`
