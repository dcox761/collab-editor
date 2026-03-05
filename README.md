# Collab Editor

A collaborative Markdown editor with a block-based WYSIWYG interface, file browser, and multi-tab support. Built with React, BlockNote, Express, and TypeScript.

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
| `.env` | `DOCS_PATH=/app/docs`, `PORT=3000` |

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

## Project Structure

```
├── .devcontainer/
│   ├── Dockerfile              # Devcontainer: Ubuntu + Node.js 20 + Docker CLI
│   └── devcontainer.json       # Devcontainer config with /tmp node_modules setup
├── Dockerfile                  # Multi-stage Docker build (production)
├── docker-compose.yml          # Single-service compose
├── docker-entrypoint.sh        # Volume seeder
├── package.json                # Dependencies and scripts
├── tsconfig.json               # Client TypeScript config
├── tsconfig.server.json        # Server TypeScript config
├── vite.config.ts              # Vite bundler + dev proxy
├── .env                        # Environment variables
├── docs/                       # Sample documents (mounted volume in Docker)
│   ├── AI-COLLABORATION.md     # Full requirements and build log
│   ├── welcome.md
│   └── example/
│       └── nested-doc.md
├── plans/                      # Implementation plans
│   ├── phase-1a-plan.md
│   └── source-mode-plan.md
└── src/
    ├── server/
    │   ├── index.ts            # Express entry point
    │   ├── routes/files.ts     # File CRUD REST API
    │   └── services/fileService.ts  # Filesystem ops with path traversal protection
    └── client/
        ├── index.html          # SPA entry
        ├── main.tsx            # React entry with MantineProvider
        ├── App.tsx             # Three-panel layout
        ├── styles/global.css   # All component styles
        ├── hooks/
        │   ├── useFileTree.ts  # File tree data fetching
        │   └── useOpenFiles.ts # Open tabs state management
        └── components/
            ├── Editor/
            │   ├── MarkdownEditor.tsx  # BlockNote + Source mode toggle
            │   ├── EditorPanel.tsx     # Tab bar + active editor
            │   ├── TabBar.tsx          # Tab bar component
            │   └── Tab.tsx            # Single tab with dirty indicator
            ├── FileBrowser/
            │   ├── FileBrowser.tsx     # Tree view sidebar
            │   ├── FileTreeItem.tsx    # Recursive tree node
            │   └── NewFileDialog.tsx   # Create file/folder dialog
            └── ChatPanel/
                └── ChatPanel.tsx      # Placeholder (Phase 1c)
```

## Editor Modes

The editor supports two modes, toggled per-tab via the **Rich / Source** buttons:

- **Rich mode** (default): BlockNote WYSIWYG block editor
- **Source mode**: Raw Markdown in a monospace textarea

Content syncs bidirectionally on toggle. Both modes trigger the same save/dirty-tracking flow.

## REST API

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/tree` | — | `FileTreeNode[]` |
| `GET` | `/api/files/*path` | — | `{ content: string }` |
| `PUT` | `/api/files/*path` | `{ content: string }` | `{ success: true }` |
| `POST` | `/api/files/*path` | `{ type: "file" \| "dir" }` | `{ success: true }` |
| `PATCH` | `/api/files/*path` | `{ newPath: string }` | `{ success: true }` |
| `DELETE` | `/api/files/*path` | — | `{ success: true }` |

All file paths are validated to prevent path traversal attacks.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save active document |
| `Tab` (source mode) | Insert 2 spaces |

## Roadmap

See the full requirements and build phases in [`docs/AI-COLLABORATION.md`](docs/AI-COLLABORATION.md).

| Phase | Status | Description |
|-------|--------|-------------|
| **1a** | ✅ Done | Single-user editor in Docker |
| **1b** | Planned | Real-time collaboration (Y.js + WebSocket) |
| **1c** | Planned | AI chat integration |
| **2** | Planned | Git integration & polish |
