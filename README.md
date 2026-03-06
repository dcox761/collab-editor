# Collab Editor

A collaborative Markdown editor with real-time multi-user editing (Y.js + WebSocket), AI chat assistant with streaming and surgical document editing, CodeMirror 6 source editor, and block-based preview. Built with React, Express, and TypeScript.

## Quick Start — Docker

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The first run seeds a `docs` volume with sample Markdown files. Documents persist across container restarts.

## Quick Start — Development (Devcontainer)

This project uses a VS Code Devcontainer. The `.devcontainer/Dockerfile` installs Node.js 20 LTS, and the `postCreateCommand` in `devcontainer.json` automatically installs dependencies to `/tmp/collab-editor-deps` (Docker filesystem) for performance, then symlinks `node_modules` back to the workspace.

Once the devcontainer is built, dependencies are ready:

```bash
npm run dev
```

This starts two processes concurrently:
- **Express server** on port 3000 (via `tsx watch`)
- **Vite dev server** on port 5173 (with API proxy to 3000)

Open [http://localhost:5173](http://localhost:5173) for hot-reloading development.

By default, the server reads/writes Markdown files in `./docs`. Override with the `DOCS_PATH` environment variable.

### Why /tmp for node_modules?

The devcontainer workspace directory is bind-mounted from the host, which is very slow for the thousands of small files in `node_modules`. Dependencies are installed on the Docker filesystem (`/tmp/collab-editor-deps`) and symlinked into the workspace. If the container is rebuilt, the `postCreateCommand` re-runs automatically.

To manually re-install after changing `package.json`:

```bash
cp package.json package-lock.json /tmp/collab-editor-deps/
cd /tmp/collab-editor-deps && npm install
```

## Quick Start — Development (without Docker)

Requires Node.js 20+.

```bash
npm install
npm run dev
```

## Build for Production

```bash
npm run build
npm start
```

This:
1. Bundles the React client with Vite → `dist/client/`
2. Compiles the server TypeScript → `dist/server/`
3. Runs the Express server serving both the API and static client

## Docker Details

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: builder (install + build) → production (runtime only) |
| `docker-compose.yml` | Single `app` service on port 3000 with a named `docs` volume |
| `docker-entrypoint.sh` | Seeds the docs volume with sample files if empty on first run |
| `.env` | AI configuration variables (see Environment Variables) |

### Rebuild after code changes

```bash
docker compose up --build
```

### Reset the docs volume

```bash
docker compose down -v
docker compose up --build
```

### View logs

```bash
docker compose logs -f app
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server listening port |
| `DOCS_PATH` | `/app/docs` (Docker) or `./docs` (local) | Directory containing Markdown files |
| `AI_ENDPOINT` | _(unset — AI disabled)_ | OpenAI-compatible API base URL |
| `AI_API_KEY` | _(unset)_ | API key for AI endpoint |
| `AI_MODEL` | `gpt-4o` | Model identifier |
| `AI_MAX_TOKENS` | `4096` | Max tokens per AI response |
| `AI_CONTEXT_WINDOW` | `8192` | Context window budget (characters) |
| `AI_TOOLS_ENABLED` | `true` | Enable AI tool-use for surgical edits |
| `SYSTEM_PROMPT_PATH` | `docs/SYSTEM-PROMPT.md` | Path to AI system prompt file |

`PORT` and `DOCS_PATH` are set in `docker-compose.yml` for Docker deployments. `.env` contains only AI settings (shared between Docker and dev mode).

## Project Structure

```
src/
  client/              React SPA (Vite)
    components/        Editor, FileBrowser, ChatPanel
    hooks/             useYjsProvider, useAiChat, useOpenFiles, etc.
    styles/            global.css
  server/              Express + WebSocket server
    routes/            files.ts (CRUD), ai.ts (chat streaming)
    services/          aiService, fileService, yjsPersistence, yjsService
    ws/                yjsHandler.ts (Y.js WebSocket)
docs/                  Markdown files (mounted volume in Docker)
plans/                 Implementation plans and issue log
```

## Editor Modes

The editor supports two modes, toggled per-tab via the **Source / Preview** buttons:

- **Source mode** (default): CodeMirror 6 with collaborative cursors via Y.js binding
- **Preview mode**: Read-only BlockNote rendering, updated live from Y.js state

## REST API

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/tree` | — | `FileTreeNode[]` |
| `GET` | `/api/files/*path` | — | `{ content: string }` |
| `PUT` | `/api/files/*path` | `{ content: string }` | `{ success: true }` |
| `POST` | `/api/files/*path` | `{ type: "file" \| "dir" }` | `{ success: true }` |
| `PATCH` | `/api/files/*path` | `{ newPath: string }` | `{ success: true }` |
| `DELETE` | `/api/files/*path` | — | `{ success: true }` |
| `POST` | `/api/save/*path` | — | Forces Y.js doc save to disk |
| `GET` | `/api/ai/config` | — | `{ enabled, model }` |
| `GET` | `/api/ai/budget` | — | `{ contextWindow, maxTokens }` |
| `POST` | `/api/ai/chat` | `{ filePath, messages, documentContent }` | SSE stream (`delta`, `edit`, `done` events) |

All file paths are validated to prevent path traversal attacks.

## WebSocket

| Endpoint | Purpose |
|----------|---------|
| `ws://host:port/yjs/:roomName` | Y.js collaborative document sync (one room per file) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save active document |
| `Tab` (source mode) | Insert 2 spaces |

## Roadmap

See the full requirements in [`docs/AI-COLLABORATION.md`](docs/AI-COLLABORATION.md) and detailed plans in [`plans/`](plans/).

| Phase | Status | Description |
|-------|--------|-------------|
| **1a** | ✅ Done | Single-user editor in Docker |
| **1b** | ✅ Done | Real-time collaboration (Y.js + WebSocket) |
| **1c** | ✅ Done | AI chat integration |
| **2a** | Planned | Local checkpoints |
| **2b** | Planned | Table of contents |
| **3** | Planned | Git integration & polish |
