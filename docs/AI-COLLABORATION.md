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

### Phase 2 — Local Checkpoints & Document Navigation

Core goal: protect against accidental auto-saved mistakes with automatic local checkpoints, and improve navigation within large documents.

#### 2a. Local Checkpoints

Auto-save (Phase 1b) persists every 5 seconds, which means mistakes can be saved before a user notices. Y.js provides in-session undo, and Git (Phase 3) will provide commit-level history, but a lightweight local checkpoint system fills the gap between the two.

| Step | Deliverable |
|---|---|
| 2a.1 | Checkpoint service: on each 5-second save, also write a timestamped copy to `.checkpoints/` |
| 2a.2 | Checkpoint retention policy — keep: every 1 min for the last 10 min, every 10 min for the last 1 hr, every 1 hr for the last 1 day, every 1 day for the last 5 days. Older checkpoints are pruned automatically. |
| 2a.3 | Checkpoint storage layout: `.checkpoints/<relative-path>/<filename>.<ISO-timestamp>.md` mirroring the docs folder structure |
| 2a.4 | `.checkpoints/` added to `.gitignore` so checkpoints are local-only and never committed |
| 2a.5 | Checkpoint browser UI: toolbar button or menu to list previous versions of the current file with timestamps |
| 2a.6 | Read-only checkpoint viewer: open a selected checkpoint in a read-only panel for inspection and copy/paste recovery |

**Design notes**:
- Checkpoints are plain Markdown files on disk — no database or special format required
- The retention policy runs as a cleanup pass after each new checkpoint is written
- Checkpoints are per-file, not whole-repo snapshots
- The checkpoint viewer opens alongside the live editor (not replacing it) so users can copy content back

#### 2b. Table of Contents Navigator

Large Markdown documents need a way to quickly jump to sections without scrolling.

| Step | Deliverable |
|---|---|
| 2b.1 | TOC panel: parse Markdown headings from Y.Text and display as a clickable outline tree |
| 2b.2 | Click-to-scroll: clicking a heading in the TOC scrolls the Source editor to that heading |
| 2b.3 | Active heading highlight: the TOC highlights whichever heading is currently visible in the viewport |
| 2b.4 | Auto-update: TOC refreshes when the document content changes, debounced to avoid excessive re-parsing |

**Phase 2 outcome**: Users are protected from accidental auto-saved mistakes by local checkpoints with time-based retention, and can navigate large documents via a table-of-contents outline.

### Phase 3 — Git Integration & Polish

Core goal: add Git version control, remote sync, and remaining features.

| Step | Deliverable |
|---|---|
| 3.1 | Docker Compose updated to add Forgejo container |
| 3.2 | Git sparse checkout and repository connection |
| 3.3 | Basic Git operations: commit, push, pull, diff, log |
| 3.4 | Merge conflict detection and resolution UI |
| 3.5 | Periodic remote sync with user prompt to pull |
| 3.6 | AI git commands via chat: commit, push, pull, branch, rollback, summarise changes |
| 3.7 | AI audit trail logging |

**Phase 3 outcome**: Full Git-backed collaborative editor with AI-assisted version control operations.

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
| Backup strategy for uncommitted work | Addressed by Phase 2a local checkpoints; Git commits provide long-term history |

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

