import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { filesRouter } from './routes/files.js';
import { aiRouter } from './routes/ai.js';
import { setupYjsWebSocket } from './ws/yjsHandler.js';
import { initPersistence, stopPersistence, saveAllDirty } from './services/yjsPersistence.js';
import { destroyAllRooms } from './services/yjsService.js';
import { saveDocToDisk } from './services/yjsPersistence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DOCS_PATH = process.env.DOCS_PATH || path.join(__dirname, '../../docs');

// Make DOCS_PATH available to routes
app.locals.docsPath = path.resolve(DOCS_PATH);

app.use(express.json());

// API routes
app.use('/api', filesRouter);
app.use('/api', aiRouter);

// Serve static client files in production
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Create HTTP server (instead of app.listen) so we can attach WebSocket
const server = http.createServer(app);

// Attach Y.js WebSocket server for real-time collaboration
setupYjsWebSocket(server);

// Start periodic persistence (save Y.Docs to disk every 5s)
initPersistence(app.locals.docsPath);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving docs from: ${app.locals.docsPath}`);
  console.log(`Y.js WebSocket available at ws://0.0.0.0:${PORT}/yjs/:roomName`);
});

// Graceful shutdown: save all dirty docs and destroy rooms
async function shutdown(signal: string) {
  console.log(`\n[Shutdown] Received ${signal}, saving all documents...`);
  stopPersistence();
  await saveAllDirty();
  await destroyAllRooms(saveDocToDisk);
  console.log('[Shutdown] Cleanup complete, exiting.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
